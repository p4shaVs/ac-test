// CoreAC Setup — entry point.
//
//   CoreAC-Setup.exe                         the installer window
//   CoreAC-Setup.exe --api URL --key KEY     same, with the panel / key filled in
//   CoreAC-Setup.exe --render DIR            save every screen as PNG (design check, no network)
//   CoreAC-Setup.exe --find OUT.txt          run the server-folder search, write the results
//   CoreAC-Setup.exe --selftest CONFIG OUT   headless install: CONFIG is JSON {api,key,cfg,stealth}
//
// The panel address comes from the download: /api/account/installer appends
// "#COREAC-SETUP#{"api":"https://…"}#END#" after the PE image.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CoreAcSetup
{
    static class Program
    {
        public const string Version = "1.0.0";
        // Read by tools/sim/panel-checks.ts to make sure the committed exe matches the source.
        public const string BuildStamp = "CoreAC Setup " + Version;

        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch (Exception) { }
            // English UI everywhere: dates, numbers and (where the OS has them) system messages.
            Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo("en-GB");
            Thread.CurrentThread.CurrentUICulture = System.Globalization.CultureInfo.GetCultureInfo("en-US");
            PanelApi.EnableModernTls();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (var g = Graphics.FromHwnd(IntPtr.Zero)) Theme.Scale = g.DpiX / 96f;

            string api = Arg(args, "--api") ?? ReadEmbeddedApi();
            string key = Arg(args, "--key");

            string render = Arg(args, "--render");
            if (render != null)
            {
                Theme.Scale = 1f;
                using (var f = new MainForm(api ?? "https://panel.example.com", null))
                {
                    f.StartPosition = FormStartPosition.Manual;
                    f.Location = new Point(-4000, -4000);
                    f.ShowInTaskbar = false;
                    f.Show();
                    f.RenderSnapshots(render);
                }
                return 0;
            }

            string find = Arg(args, "--find");
            if (find != null)
            {
                var sb = new StringBuilder();
                var sw = System.Diagnostics.Stopwatch.StartNew();
                var list = ServerFinder.Find(null, CancellationToken.None);
                sb.AppendLine("took " + sw.ElapsedMilliseconds + " ms, " + list.Count + " found");
                foreach (var c in list)
                    sb.AppendLine(c.Score + "\t" + c.CfgPath + "\t" + c.Hostname + "\tres=" + c.ResourceCount + "\tinstalled=" + c.InstalledAs + "\ttx=" + c.FromTxAdmin + "\tnear=" + c.NearInstaller);
                File.WriteAllText(find, sb.ToString());
                return 0;
            }

            string selftest = Arg(args, "--selftest");
            if (selftest != null)
            {
                int idx = Array.IndexOf(args, "--selftest");
                string outFile = idx + 2 < args.Length ? args[idx + 2] : "selftest.log";
                return SelfTest(selftest, outFile);
            }

            Application.Run(new MainForm(api, key));
            return 0;
        }

        static string Arg(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        /// <summary>Panel address appended to the exe by the panel's download route.</summary>
        static string ReadEmbeddedApi()
        {
            try
            {
                byte[] tail;
                using (var fs = new FileStream(Application.ExecutablePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    int n = (int)Math.Min(fs.Length, 8192);
                    fs.Seek(-n, SeekOrigin.End);
                    tail = new byte[n];
                    int read = 0;
                    while (read < n)
                    {
                        int r = fs.Read(tail, read, n - read);
                        if (r <= 0) break;
                        read += r;
                    }
                }
                string text = Encoding.UTF8.GetString(tail);
                int a = text.LastIndexOf("#COREAC-SETUP#", StringComparison.Ordinal);
                if (a < 0) return null;
                int b = text.IndexOf("#END#", a, StringComparison.Ordinal);
                if (b < 0) return null;
                string json = text.Substring(a + 14, b - a - 14);
                var obj = new JavaScriptSerializer().DeserializeObject(json) as IDictionary;
                var api = obj != null && obj.Contains("api") ? obj["api"] as string : null;
                if (api != null && (api.StartsWith("http://") || api.StartsWith("https://"))) return api.TrimEnd('/');
            }
            catch (Exception) { }
            return null;
        }

        /// <summary>Headless install used by the build checks — same engine as the window.</summary>
        static int SelfTest(string configPath, string outFile)
        {
            var log = new StringBuilder();
            int code = 0;
            try
            {
                var cfg = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(configPath)) as IDictionary;
                string api = (string)cfg["api"];
                string key = (string)cfg["key"];
                string cfgPath = (string)cfg["cfg"];
                bool stealth = !cfg.Contains("stealth") || (bool)cfg["stealth"];
                using (var panel = new PanelApi(api))
                {
                    var info = panel.CheckKey(key, CancellationToken.None).GetAwaiter().GetResult();
                    log.AppendLine("key ok: product=" + info.Product + " servers=" + string.Join(",", info.Servers.Select(s => s.Name).ToArray()));
                    var found = ServerFinder.Inspect(cfgPath);
                    log.AppendLine("inspect: " + (found == null ? "NOT A SERVER" : found.Hostname + " installedAs=" + found.InstalledAs + " res=" + found.ResourceCount));
                    var engine = new InstallEngine();
                    engine.OnLog = l => log.AppendLine(l);
                    var result = engine.Run(panel, new InstallOptions { Key = key, ServerId = info.Servers[0].Id, CfgPath = cfgPath, Stealth = stealth }, CancellationToken.None)
                        .GetAwaiter().GetResult();
                    log.AppendLine("RESULT resource=" + result.ResourceName + " updated=" + result.Updated + " backup=" + result.BackupPath + " legacyRemoved=" + result.RemovedLegacy.Count);
                }
            }
            catch (PanelException ex)
            {
                log.AppendLine("PANEL ERROR " + ex.Status + " " + ex.Code + ": " + ex.Message);
                code = 2;
            }
            catch (Exception ex)
            {
                log.AppendLine("ERROR " + ex);
                code = 1;
            }
            File.WriteAllText(outFile, log.ToString());
            return code;
        }
    }
}
