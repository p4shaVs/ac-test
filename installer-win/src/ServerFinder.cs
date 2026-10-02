// CoreAC Setup — finds FiveM server folders (the folder that holds server.cfg).
//
// Where it looks, in order:
//   1. around the installer itself (people often run it from the server folder),
//   2. txAdmin profiles (txData/<profile>/config.json names the server data path),
//      found next to running FXServer.exe processes and FXServer folders,
//   3. a time-boxed scan of the user's folders and the root of every fixed drive.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace CoreAcSetup
{
    class ServerCandidate
    {
        public string CfgPath;
        public string Root;
        public string Hostname;
        public int ResourceCount;
        public string InstalledAs;   // existing CoreAC folder name, from the managed block
        public bool FromTxAdmin;
        public bool NearInstaller;
        public DateTime CfgModified;

        public int Score
        {
            get
            {
                int s = 0;
                if (InstalledAs != null) s += 100;
                if (FromTxAdmin) s += 40;
                if (NearInstaller) s += 30;
                if (ResourceCount > 0) s += 20;
                if (!string.IsNullOrEmpty(Hostname)) s += 5;
                return s;
            }
        }
    }

    static class ServerFinder
    {
        static readonly HashSet<string> Skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Windows", "Program Files", "Program Files (x86)", "ProgramData", "$Recycle.Bin", "System Volume Information",
            "AppData", "node_modules", ".git", "cache", "resources", "Recovery", "PerfLogs", "MSOCache", "$WinREAgent",
            "steamapps", "Microsoft", "WindowsApps", "Packages", "obj", "bin", "logs", "crashes", "citizen"
        };

        /// <summary>Reads one server.cfg; null when it does not look like a FiveM server.</summary>
        public static ServerCandidate Inspect(string cfgPath)
        {
            try
            {
                var fi = new FileInfo(cfgPath);
                if (!fi.Exists || fi.Length > 4 * 1024 * 1024) return null;
                string raw = File.ReadAllText(fi.FullName);
                string root = fi.DirectoryName;
                bool hasResources = Directory.Exists(Path.Combine(root, "resources"));
                bool looksFiveM = Regex.IsMatch(raw, @"(?im)^\s*(ensure|start|endpoint_add_tcp|sv_licenseKey|sv_hostname)\b");
                if (!hasResources && !looksFiveM) return null;

                var c = new ServerCandidate { CfgPath = fi.FullName, Root = root, CfgModified = fi.LastWriteTime };
                var host = Regex.Match(raw, "(?im)^\\s*sv_hostname\\s+\"?([^\"\\r\\n]*)\"?");
                if (host.Success) c.Hostname = StripColours(host.Groups[1].Value).Trim();
                c.InstalledAs = InstallEngine.GetManagedName(raw);
                if (hasResources)
                {
                    try { c.ResourceCount = Directory.GetDirectories(Path.Combine(root, "resources")).Length; }
                    catch (UnauthorizedAccessException) { }
                }
                return c;
            }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }

        /// <summary>A folder or file the user picked by hand.</summary>
        public static ServerCandidate FromPicked(string path)
        {
            if (File.Exists(path)) return Inspect(path);
            if (!Directory.Exists(path)) return null;
            string direct = Path.Combine(path, "server.cfg");
            if (File.Exists(direct)) return Inspect(direct);
            // The user picked the FXServer or txData folder: look two levels down.
            foreach (var cfg in FindFiles(path, 3, DateTime.UtcNow.AddSeconds(4), CancellationToken.None))
            {
                var c = Inspect(cfg);
                if (c != null) return c;
            }
            return null;
        }

        static string StripColours(string s)
        {
            return Regex.Replace(s, @"\^[0-9]", "");
        }

        public static List<ServerCandidate> Find(Action<string> status, CancellationToken ct)
        {
            var found = new Dictionary<string, ServerCandidate>(StringComparer.OrdinalIgnoreCase);
            Action<string, bool, bool> add = (cfg, tx, near) =>
            {
                if (string.IsNullOrEmpty(cfg)) return;
                string full;
                try { full = Path.GetFullPath(cfg); } catch (Exception) { return; }
                ServerCandidate existing;
                if (found.TryGetValue(full, out existing))
                {
                    existing.FromTxAdmin |= tx;
                    existing.NearInstaller |= near;
                    return;
                }
                var c = Inspect(full);
                if (c == null) return;
                c.FromTxAdmin = tx;
                c.NearInstaller = near;
                found[full] = c;
            };

            // 1. around the installer
            Report(status, "Looking next to the installer…");
            string here = AppDomain.CurrentDomain.BaseDirectory;
            try
            {
                string dir = here;
                for (int i = 0; i < 5 && dir != null; i++)
                {
                    add(Path.Combine(dir, "server.cfg"), false, true);
                    dir = Path.GetDirectoryName(dir.TrimEnd('\\'));
                }
                foreach (var cfg in FindFiles(here, 3, DateTime.UtcNow.AddSeconds(3), ct)) add(cfg, false, true);
            }
            catch (Exception) { }

            // 2. txAdmin
            Report(status, "Checking txAdmin profiles…");
            var fxDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var exe in RunningFxServers()) fxDirs.Add(Path.GetDirectoryName(exe));
            foreach (var txCfg in TxAdminConfigs(fxDirs)) add(txCfg, true, false);

            // 3. scan
            var deadline = DateTime.UtcNow.AddSeconds(14);
            var roots = new List<KeyValuePair<string, int>>();
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            foreach (var sub in new[] { "Desktop", "Documents", "Downloads", "OneDrive\\Desktop", "OneDrive\\Documents" })
                roots.Add(new KeyValuePair<string, int>(Path.Combine(profile, sub), 4));
            roots.Add(new KeyValuePair<string, int>(profile, 2));
            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    if (drive.DriveType == DriveType.Fixed && drive.IsReady) roots.Add(new KeyValuePair<string, int>(drive.RootDirectory.FullName, 3));
                }
                catch (IOException) { }
            }
            foreach (var r in roots)
            {
                if (ct.IsCancellationRequested || DateTime.UtcNow > deadline) break;
                if (!Directory.Exists(r.Key)) continue;
                Report(status, "Searching " + r.Key);
                foreach (var hit in FindFiles(r.Key, r.Value, deadline, ct, fxDirs))
                    add(hit, false, false);
            }
            // txAdmin profiles next to FXServer folders the scan discovered
            foreach (var txCfg in TxAdminConfigs(fxDirs)) add(txCfg, true, false);

            return found.Values
                .OrderByDescending(c => c.Score)
                .ThenByDescending(c => c.CfgModified)
                .Take(12)
                .ToList();
        }

        static void Report(Action<string> status, string text)
        {
            if (status != null) status(text);
        }

        static IEnumerable<string> FindFiles(string root, int depth, DateTime deadline, CancellationToken ct)
        {
            return FindFiles(root, depth, deadline, ct, null);
        }

        /// <summary>Breadth-first search for server.cfg; also remembers folders holding FXServer.exe.</summary>
        static IEnumerable<string> FindFiles(string root, int depth, DateTime deadline, CancellationToken ct, HashSet<string> fxDirs)
        {
            var queue = new Queue<KeyValuePair<string, int>>();
            queue.Enqueue(new KeyValuePair<string, int>(root, 0));
            int visited = 0;
            while (queue.Count > 0)
            {
                if (ct.IsCancellationRequested || DateTime.UtcNow > deadline || visited > 60000) yield break;
                var item = queue.Dequeue();
                visited++;
                string[] files = null, dirs = null;
                try
                {
                    files = Directory.GetFiles(item.Key, "*.*", SearchOption.TopDirectoryOnly);
                    dirs = Directory.GetDirectories(item.Key);
                }
                catch (UnauthorizedAccessException) { }
                catch (IOException) { }
                catch (ArgumentException) { }
                if (files != null)
                {
                    foreach (var f in files)
                    {
                        string name = Path.GetFileName(f);
                        if (string.Equals(name, "server.cfg", StringComparison.OrdinalIgnoreCase)) yield return f;
                        else if (fxDirs != null && string.Equals(name, "FXServer.exe", StringComparison.OrdinalIgnoreCase)) fxDirs.Add(item.Key);
                    }
                }
                if (dirs == null || item.Value >= depth) continue;
                foreach (var d in dirs)
                {
                    string n = Path.GetFileName(d);
                    if (Skip.Contains(n) || n.StartsWith(".")) continue;
                    try
                    {
                        if ((File.GetAttributes(d) & FileAttributes.ReparsePoint) != 0) continue; // junctions loop
                    }
                    catch (Exception) { continue; }
                    queue.Enqueue(new KeyValuePair<string, int>(d, item.Value + 1));
                }
            }
        }

        static IEnumerable<string> RunningFxServers()
        {
            var list = new List<string>();
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT ExecutablePath FROM Win32_Process WHERE Name = 'FXServer.exe'"))
                using (var results = searcher.Get())
                {
                    foreach (ManagementObject mo in results)
                    {
                        var p = mo["ExecutablePath"] as string;
                        if (!string.IsNullOrEmpty(p)) list.Add(p);
                        mo.Dispose();
                    }
                }
            }
            catch (Exception)
            {
                foreach (var p in Process.GetProcessesByName("FXServer"))
                {
                    try { list.Add(p.MainModule.FileName); }
                    catch (Exception) { }
                    finally { p.Dispose(); }
                }
            }
            return list;
        }

        /// <summary>server.cfg paths named by txAdmin profiles (txData/*/config.json) near the FXServer folders.</summary>
        static IEnumerable<string> TxAdminConfigs(IEnumerable<string> fxDirs)
        {
            var result = new List<string>();
            var txRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var dir in fxDirs)
            {
                if (string.IsNullOrEmpty(dir)) continue;
                txRoots.Add(Path.Combine(dir, "txData"));
                var parent = Path.GetDirectoryName(dir);
                if (parent != null) txRoots.Add(Path.Combine(parent, "txData"));
            }
            var ser = new JavaScriptSerializer();
            foreach (var tx in txRoots)
            {
                if (!Directory.Exists(tx)) continue;
                string[] profiles;
                try { profiles = Directory.GetDirectories(tx); }
                catch (Exception) { continue; }
                foreach (var prof in profiles)
                {
                    string conf = Path.Combine(prof, "config.json");
                    if (!File.Exists(conf)) continue;
                    try
                    {
                        var obj = ser.DeserializeObject(File.ReadAllText(conf)) as IDictionary;
                        if (obj == null) continue;
                        string dataPath = FindString(obj, "serverDataPath") ?? FindString(obj, "dataPath");
                        string cfgPath = FindString(obj, "cfgPath");
                        if (!string.IsNullOrEmpty(cfgPath) && Path.IsPathRooted(cfgPath)) result.Add(cfgPath);
                        else if (!string.IsNullOrEmpty(dataPath)) result.Add(Path.Combine(dataPath, string.IsNullOrEmpty(cfgPath) ? "server.cfg" : cfgPath));
                    }
                    catch (Exception) { }
                }
            }
            return result;
        }

        /// <summary>First string value under the key anywhere in a parsed JSON tree (txAdmin moved keys between versions).</summary>
        static string FindString(IDictionary obj, string key)
        {
            foreach (DictionaryEntry e in obj)
            {
                if (string.Equals((string)e.Key, key, StringComparison.OrdinalIgnoreCase) && e.Value is string) return (string)e.Value;
                var child = e.Value as IDictionary;
                if (child != null)
                {
                    var v = FindString(child, key);
                    if (v != null) return v;
                }
            }
            return null;
        }
    }
}
