// CoreAC Setup — the install itself. Same behaviour as the panel's .bat
// installer (src/lib/installer-script.ts), so either one can update the other's
// install:
//   * folder name: the one in server.cfg's managed block (update in place), else
//     a random stealth name (cheat menus cannot find the anti-cheat by name) or
//     "coreac";
//   * stealth installs neutralise fxmanifest name/author/description;
//   * old Aeigs-era folders whose fxmanifest says "aeigs-anticheat" are removed;
//   * server.cfg gets one managed block ABOVE the first ensure/start line, a
//     one-time backup (server.cfg.coreac.bak), UTF-8 without BOM.
// The licence key downloads the resource; the server token is requested only
// after the files are in place, so a failed download never revokes the token
// a running server is using.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace CoreAcSetup
{
    class InstallOptions
    {
        public string Key;
        public string ServerId;
        public string CfgPath;
        public bool Stealth = true;
    }

    class InstallResult
    {
        public string ServerName;
        public string ResourceName;
        public string ResourceDir;
        public string CfgPath;
        public string BackupPath;
        public bool Updated;
        public List<string> RemovedLegacy = new List<string>();
    }

    class InstallEngine
    {
        public const string Begin = "# >>> CoreAC (managed - do not edit this block) >>>";
        public const string End = "# <<< CoreAC (managed) <<<";
        static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);

        public static readonly string[] StepNames =
        {
            "Download the protected resource",
            "Unpack and check the package",
            "Install into resources",
            "Connect to your panel",
            "Configure server.cfg",
            "Remove old versions"
        };

        /// <summary>(step, state, detail)</summary>
        public Action<int, StepState, string> OnStep;
        public Action<string> OnLog;
        public Action<double> OnProgress;

        void Step(int i, StepState s, string detail)
        {
            if (OnStep != null) OnStep(i, s, detail);
            Log((s == StepState.Done ? "[ok]   " : s == StepState.Failed ? "[fail] " : s == StepState.Skipped ? "[skip] " : "[..]   ") + StepNames[i] + (string.IsNullOrEmpty(detail) ? "" : " — " + detail));
        }

        void Log(string line)
        {
            if (OnLog != null) OnLog(DateTime.Now.ToString("HH:mm:ss") + "  " + line);
        }

        void Progress(double p)
        {
            if (OnProgress != null) OnProgress(p);
        }

        public async Task<InstallResult> Run(PanelApi api, InstallOptions o, CancellationToken ct)
        {
            var result = new InstallResult { CfgPath = o.CfgPath };
            string serverRoot = Path.GetDirectoryName(o.CfgPath);
            string tempZip = Path.Combine(Path.GetTempPath(), "coreac_" + Guid.NewGuid().ToString("N") + ".zip");
            string tempDir = Path.Combine(Path.GetTempPath(), "coreac_" + Guid.NewGuid().ToString("N"));
            int current = 0;
            string createdDest = null; // a brand-new folder we must not leave half-copied
            try
            {
                Log("Panel: " + api.Base);
                Log("server.cfg: " + o.CfgPath);

                // 1. download
                current = 0;
                Step(0, StepState.Running, "Contacting the panel…");
                await api.DownloadResource(o.Key, o.ServerId, tempZip, (got, total) =>
                {
                    if (total > 0)
                    {
                        Progress(0.05 + 0.45 * got / total);
                        if (OnStep != null) OnStep(0, StepState.Running, (got / 1024) + " KB of " + (total / 1024) + " KB");
                    }
                }, ct).ConfigureAwait(false);
                Step(0, StepState.Done, (new FileInfo(tempZip).Length / 1024) + " KB");
                Progress(0.5);

                // 2. unpack
                current = 1;
                Step(1, StepState.Running, null);
                Directory.CreateDirectory(tempDir);
                ZipFile.ExtractToDirectory(tempZip, tempDir);
                string src = Path.Combine(tempDir, "coreac");
                if (!File.Exists(Path.Combine(src, "fxmanifest.lua")))
                    throw new InvalidDataException("The downloaded package is damaged (no coreac/fxmanifest.lua inside). Run the installer again.");
                int fileCount = Directory.GetFiles(src, "*", SearchOption.AllDirectories).Length;
                Step(1, StepState.Done, fileCount + " files");
                Progress(0.6);

                // 3. install
                current = 2;
                Step(2, StepState.Running, null);
                string raw = ReadText(o.CfgPath);
                string existing = GetManagedName(raw);
                string resName;
                if (existing != null && existing != "aeigs-anticheat")
                {
                    resName = existing;
                    result.Updated = true;
                }
                else resName = o.Stealth ? NewStealthName() : "coreac";
                string resourcesDir = Path.Combine(serverRoot, "resources");
                Directory.CreateDirectory(resourcesDir);
                string dest = Lp(Path.Combine(resourcesDir, resName));
                if (Directory.Exists(dest))
                {
                    // Only ever replace our own resource.
                    string mf = Path.Combine(dest, "fxmanifest.lua");
                    if (!result.Updated && File.Exists(mf) && !LooksLikeCoreAc(ReadText(mf)))
                        throw new IOException("resources\\" + resName + " already exists and is not CoreAC — turn off the stealth name or rename that folder.");
                    DeleteDirectory(dest);
                }
                if (!result.Updated) createdDest = dest;
                CopyDirectory(src, dest);
                if (resName != "coreac") NeutraliseManifest(Path.Combine(dest, "fxmanifest.lua"), resName);
                result.ResourceName = resName;
                result.ResourceDir = Plain(dest);
                createdDest = null; // complete — keep it even if a later step fails (re-running updates it)
                Step(2, StepState.Done, "resources\\" + resName + (result.Updated ? " (updated in place)" : ""));
                Progress(0.72);

                // 4. token
                current = 3;
                Step(3, StepState.Running, "Issuing a server token…");
                var claim = await api.Claim(o.Key, o.ServerId, ct).ConfigureAwait(false);
                result.ServerName = claim.ServerName;
                Step(3, StepState.Done, claim.ServerName);
                Progress(0.84);

                // 5. server.cfg
                current = 4;
                Step(4, StepState.Running, null);
                result.BackupPath = PatchCfg(o.CfgPath, claim.ApiUrl, claim.Token, resName);
                Step(4, StepState.Done, "backup: " + Path.GetFileName(result.BackupPath));
                Progress(0.94);

                // 6. legacy
                current = 5;
                Step(5, StepState.Running, null);
                result.RemovedLegacy = RemoveLegacyInstalls(Lp(resourcesDir), dest);
                Step(5, result.RemovedLegacy.Count > 0 ? StepState.Done : StepState.Skipped,
                    result.RemovedLegacy.Count > 0 ? result.RemovedLegacy.Count + " removed" : "none found");
                Progress(1);
                Log("Done. Restart the FiveM server.");
                return result;
            }
            catch (Exception ex)
            {
                if (createdDest != null)
                {
                    try { if (Directory.Exists(createdDest)) DeleteDirectory(createdDest); } catch (Exception) { }
                }
                var friendly = Friendly(ex, serverRoot);
                Step(current, StepState.Failed, ex is OperationCanceledException ? "cancelled" : friendly.Message);
                if (friendly == ex) throw;
                throw friendly;
            }
            finally
            {
                try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch (Exception) { }
                try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); } catch (Exception) { }
            }
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>
        /// Windows reports file errors in the OS language and in developer terms;
        /// the common ones get a plain English explanation with what to do.
        /// </summary>
        static Exception Friendly(Exception ex, string serverRoot)
        {
            if (ex is PanelException || ex is OperationCanceledException) return ex;
            if (ex is UnauthorizedAccessException)
                return new UnauthorizedAccessException("Windows refused access to the server folder (" + serverRoot + "). Run the installer as administrator, or move the server out of a protected folder.", ex);
            if (ex is PathTooLongException)
                return new IOException("A path inside the server folder is too long for this version of Windows. Move the server to a shorter folder (for example C:\\FXServer\\server-data) and try again.", ex);
            if (ex is InvalidDataException)
                return ex;
            var io = ex as IOException;
            if (io != null)
            {
                int code = Marshal.GetHRForException(io) & 0xFFFF;
                if (code == 32 || code == 33) // ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION
                    return new IOException("A file of the anti-cheat is in use — stop the FiveM server (or txAdmin) and try again.", ex);
                if (code == 112) // ERROR_DISK_FULL
                    return new IOException("The disk is full.", ex);
            }
            return ex;
        }

        public static string ReadText(string path)
        {
            // Detects a BOM if there is one, otherwise UTF-8 (FiveM configs are UTF-8).
            return File.ReadAllText(path, Encoding.UTF8);
        }

        static void WriteText(string path, string text)
        {
            File.WriteAllText(path, text, Utf8NoBom);
        }

        static bool LooksLikeCoreAc(string manifest)
        {
            return manifest.IndexOf("coreac", StringComparison.OrdinalIgnoreCase) >= 0
                || manifest.IndexOf("aeigs", StringComparison.OrdinalIgnoreCase) >= 0
                || Regex.IsMatch(manifest, @"(?m)^author\s+'unknown'") && Regex.IsMatch(manifest, @"(?m)^description\s+'library'");
        }

        /// <summary>Folder name of an existing CoreAC install (the ensure line inside the managed block).</summary>
        public static string GetManagedName(string raw)
        {
            var m = Regex.Match(raw, Regex.Escape(Begin) + "(.*?)" + Regex.Escape(End), RegexOptions.Singleline);
            if (!m.Success) return null;
            var e = Regex.Match(m.Groups[1].Value, @"(?mi)^\s*ensure\s+([A-Za-z0-9_\-\.]+)\s*$");
            return e.Success ? e.Groups[1].Value : null;
        }

        public static string NewStealthName()
        {
            const string letters = "abcdefghijklmnopqrstuvwxyz";
            const string chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            var rng = new Random(Guid.NewGuid().GetHashCode());
            var sb = new StringBuilder();
            for (int i = 0; i < 2; i++) sb.Append(letters[rng.Next(letters.Length)]);
            sb.Append('_');
            for (int i = 0; i < 8; i++) sb.Append(chars[rng.Next(chars.Length)]);
            return sb.ToString();
        }

        static void NeutraliseManifest(string path, string name)
        {
            if (!File.Exists(path)) return;
            string t = ReadText(path);
            t = Regex.Replace(t, @"(?m)^name\s+'[^']*'", "name '" + name + "'");
            t = Regex.Replace(t, @"(?m)^author\s+'[^']*'", "author 'unknown'");
            t = Regex.Replace(t, @"(?m)^description\s+'[^']*'", "description 'library'");
            WriteText(path, t);
        }

        /// <summary>Writes the managed block; returns the backup path.</summary>
        public static string PatchCfg(string cfg, string apiUrl, string token, string res)
        {
            string raw = ReadText(cfg);
            string bak = cfg + ".coreac.bak";
            if (!File.Exists(bak)) File.Copy(cfg, bak);

            raw = Regex.Replace(raw, Regex.Escape(Begin) + ".*?" + Regex.Escape(End), "", RegexOptions.Singleline);
            string names = "(aeigs-anticheat|coreac|" + Regex.Escape(res) + ")";
            var ensureOld = new Regex(@"^\s*(ensure|start)\s+" + names + @"\s*$", RegexOptions.IgnoreCase);
            var setOld = new Regex(@"^\s*set\s+(aeigs|coreac)_(api|token)\s", RegexOptions.IgnoreCase);
            var aceOld = new Regex(@"^\s*add_ace\s+resource\." + names + @"\s", RegexOptions.IgnoreCase);
            var lines = Regex.Split(raw, "\r?\n").Where(l => !ensureOld.IsMatch(l) && !setOld.IsMatch(l) && !aceOld.IsMatch(l)).ToList();

            var block = new List<string>
            {
                Begin,
                "# CoreAC resource folder: resources/" + res,
                "set coreac_api \"" + apiUrl.TrimEnd('/') + "\"",
                "set coreac_token \"" + token + "\"",
                "add_ace resource." + res + " command allow",
                "ensure " + res,
                End
            };
            // The anti-cheat has to start before every other resource.
            var firstStart = new Regex(@"^\s*(ensure|start)\s+\S", RegexOptions.IgnoreCase);
            int idx = lines.FindIndex(l => firstStart.IsMatch(l));
            var output = new List<string>();
            if (idx >= 0)
            {
                output.AddRange(lines.Take(idx));
                output.AddRange(block);
                output.Add("");
                output.AddRange(lines.Skip(idx));
            }
            else
            {
                output.AddRange(lines);
                output.Add("");
                output.AddRange(block);
            }
            WriteText(cfg, string.Join("\r\n", output).TrimEnd() + "\r\n");
            return bak;
        }

        static List<string> RemoveLegacyInstalls(string resourcesDir, string keep)
        {
            var removed = new List<string>();
            var stack = new Stack<KeyValuePair<string, int>>();
            stack.Push(new KeyValuePair<string, int>(resourcesDir, 0));
            while (stack.Count > 0)
            {
                var item = stack.Pop();
                string[] dirs;
                try { dirs = Directory.GetDirectories(item.Key); }
                catch (Exception) { continue; }
                foreach (var d in dirs)
                {
                    if (string.Equals(Path.GetFileName(d), "aeigs-anticheat", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(Plain(d), Plain(keep), StringComparison.OrdinalIgnoreCase))
                    {
                        string mf = Path.Combine(d, "fxmanifest.lua");
                        if (File.Exists(mf) && ReadText(mf).IndexOf("aeigs-anticheat", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            DeleteDirectory(d);
                            removed.Add(Plain(d));
                            continue;
                        }
                    }
                    if (item.Value < 2) stack.Push(new KeyValuePair<string, int>(d, item.Value + 1));
                }
            }
            return removed;
        }

        /// <summary>
        /// Long-path form for paths near MAX_PATH. Windows without the LongPathsEnabled
        /// policy refuses plain paths over 260 characters; the extended form always works.
        /// </summary>
        const string ExtendedPrefix = @"\\?\";
        const string ExtendedUncPrefix = @"\\?\UNC\";

        static string Lp(string path)
        {
            if (path.StartsWith(ExtendedPrefix)) return path;
            string full = Path.GetFullPath(path);
            // Short enough that a file name inside cannot cross MAX_PATH: keep it plain
            // (the extended form needs .NET 4.6.2+, which old Windows may lack).
            if (full.Length < 160) return full;
            return full.StartsWith(@"\\") ? ExtendedUncPrefix + full.Substring(2) : ExtendedPrefix + full;
        }

        static string Plain(string path)
        {
            if (path.StartsWith(ExtendedUncPrefix)) return @"\\" + path.Substring(ExtendedUncPrefix.Length);
            return path.StartsWith(ExtendedPrefix) ? path.Substring(ExtendedPrefix.Length) : path;
        }

        static void CopyDirectory(string src, string dst)
        {
            src = Lp(src);
            dst = Lp(dst);
            Directory.CreateDirectory(dst);
            foreach (var f in Directory.GetFiles(src)) File.Copy(Lp(f), Lp(Path.Combine(dst, Path.GetFileName(f))), true);
            foreach (var d in Directory.GetDirectories(src)) CopyDirectory(d, Path.Combine(dst, Path.GetFileName(d)));
        }

        static void DeleteDirectory(string dir)
        {
            dir = Lp(dir);
            foreach (var d in Directory.GetDirectories(dir))
            {
                // A junction inside the folder is removed, never followed.
                if ((File.GetAttributes(Lp(d)) & FileAttributes.ReparsePoint) != 0) Directory.Delete(Lp(d), false);
                else DeleteDirectory(d);
            }
            foreach (var f in Directory.GetFiles(dir))
            {
                // Read-only files (copied from a zip on some systems) make File.Delete fail.
                string lf = Lp(f);
                try { File.SetAttributes(lf, FileAttributes.Normal); } catch (Exception) { }
                File.Delete(lf);
            }
            Directory.Delete(dir, false);
        }
    }
}
