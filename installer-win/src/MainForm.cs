// CoreAC Setup — the window. Borderless, dark, three steps:
//   1. licence key (checked against the panel; pick a server if the key has several)
//   2. server folder (found automatically, or browse)
//   3. install (live checklist) → finish
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace CoreAcSetup
{
    class MainForm : Form
    {
        // ---------------------------------------------------------------- state
        string apiBase;
        string key = "";
        KeyInfo keyInfo;
        ServerInfo server;
        ServerCandidate target;
        CancellationTokenSource scanCts;
        int step; // 0 key, 1 folder, 2 install, 3 done

        // ---------------------------------------------------------------- chrome
        readonly Panel rail = new Panel();
        readonly Panel content = new Panel();
        readonly Panel keyPage = new Panel(), folderPage = new Panel(), installPage = new Panel(), donePage = new Panel();
        readonly TitleButton btnClose = new TitleButton(true), btnMin = new TitleButton(false);

        // key page
        InputBox keyBox;
        TextLabel keyStatus;
        FlatButton keyNext, pasteBtn;
        Panel keyResult;
        TextLabel apiLabel;
        LinkLabel apiChange;
        InputBox apiBox;

        // folder page
        Panel cards;
        TextLabel scanStatus;
        ProgressLine scanBar;
        ToggleRow stealth;
        FlatButton folderNext, folderBack, browseBtn, rescanBtn;

        // install page
        TextLabel installTitle, installSub, installError;
        StepList steps;
        ProgressLine installBar;
        TextBox logBox;
        FlatButton retryBtn, adminBtn, installBack;
        LinkLabel logToggle;
        readonly List<string> logLines = new List<string>();

        // done page
        TextLabel doneSummary;
        InstallResult lastResult;

        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        public MainForm(string api, string presetKey)
        {
            apiBase = api;
            Text = "CoreAC Setup";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Theme.Bg;
            ForeColor = Theme.Text;
            Font = Theme.Ui(9.5f);
            ClientSize = new Size(Theme.S(900), Theme.S(580));
            DoubleBuffered = true;
            KeyPreview = true;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

            rail.Bounds = new Rectangle(0, 0, Theme.S(260), ClientSize.Height);
            rail.BackColor = Theme.Rail;
            rail.Paint += PaintRail;
            rail.MouseDown += Drag;
            Controls.Add(rail);

            content.Bounds = new Rectangle(rail.Width, 0, ClientSize.Width - rail.Width, ClientSize.Height);
            content.BackColor = Theme.Bg;
            content.MouseDown += Drag;
            Controls.Add(content);

            btnClose.Location = new Point(content.Width - btnClose.Width - Theme.S(8), Theme.S(8));
            btnMin.Location = new Point(btnClose.Left - btnMin.Width, Theme.S(8));
            btnClose.Click += delegate { Close(); };
            btnMin.Click += delegate { WindowState = FormWindowState.Minimized; };
            content.Controls.Add(btnClose);
            content.Controls.Add(btnMin);

            foreach (var p in new[] { keyPage, folderPage, installPage, donePage })
            {
                p.Bounds = new Rectangle(Theme.S(48), Theme.S(52), content.Width - Theme.S(96), content.Height - Theme.S(84));
                p.BackColor = Theme.Bg;
                p.Visible = false;
                p.MouseDown += Drag;
                content.Controls.Add(p);
            }

            BuildKeyPage();
            BuildFolderPage();
            BuildInstallPage();
            BuildDonePage();
            ShowStep(0);
            if (!string.IsNullOrEmpty(presetKey)) keyBox.Text = presetKey;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ClassStyle |= 0x20000; // CS_DROPSHADOW
                cp.Style |= 0x20000;      // WS_MINIMIZEBOX: taskbar click minimises a borderless window
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int round = 2; // DWMWCP_ROUND (Windows 11)
                DwmSetWindowAttribute(Handle, 33, ref round, sizeof(int));
                int dark = 1;  // DWMWA_USE_IMMERSIVE_DARK_MODE
                DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
            }
            catch (Exception) { }
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape && step != 2) Close();
            base.OnKeyDown(e);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (step == 2 && installBusy)
            {
                var r = MessageBox.Show(this, "The installation is still running. Stop it?", "CoreAC Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (r != DialogResult.Yes) { e.Cancel = true; return; }
                if (installCts != null) installCts.Cancel();
            }
            if (scanCts != null) scanCts.Cancel();
            base.OnFormClosing(e);
        }

        void Drag(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 0x2, 0); // WM_NCLBUTTONDOWN, HTCAPTION
        }

        // ------------------------------------------------------------- the rail

        static readonly string[] RailSteps = { "Licence key", "Server folder", "Install" };
        static readonly string[] RailHints = { "Check your key with the panel", "Where your server.cfg lives", "Files, token and server.cfg" };

        void PaintRail(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            Theme.DrawLogo(g, new RectangleF(Theme.S(28), Theme.S(30), Theme.S(36), Theme.S(36)));
            using (var f = Theme.UiBold(13f))
                TextRenderer.DrawText(g, "CoreAC", f, new Point(Theme.S(74), Theme.S(29)), Theme.Text, TextFormatFlags.NoPadding);
            using (var f = Theme.UiSemi(7f))
                TextRenderer.DrawText(g, "SERVER SETUP", f, new Point(Theme.S(75), Theme.S(54)), Theme.Dim, TextFormatFlags.NoPadding);

            int y0 = Theme.S(124);
            int row = Theme.S(64);
            int current = Math.Min(step, 2);
            for (int i = 0; i < RailSteps.Length; i++)
            {
                bool done = i < current || step == 3;
                bool active = i == current && step != 3;
                int y = y0 + i * row;
                var c = new RectangleF(Theme.S(28), y, Theme.S(26), Theme.S(26));
                if (i < RailSteps.Length - 1)
                    using (var pen = new Pen(done ? Color.FromArgb(90, 90, 96) : Color.FromArgb(34, 34, 38), 1.2f))
                        g.DrawLine(pen, c.X + c.Width / 2, c.Bottom + Theme.S(6), c.X + c.Width / 2, y + row - Theme.S(6));
                if (done)
                {
                    using (var b = new SolidBrush(Theme.White)) g.FillEllipse(b, c);
                    Theme.DrawCheck(g, Theme.Black, RectangleF.Inflate(c, -Theme.S(6), -Theme.S(6)), 2.2f * Theme.Scale);
                }
                else
                {
                    using (var pen = new Pen(active ? Theme.White : Theme.Faint, active ? 1.8f : 1.2f)) g.DrawEllipse(pen, c);
                    using (var f = Theme.UiSemi(8.5f))
                        TextRenderer.DrawText(g, (i + 1).ToString(), f, Rectangle.Round(c), active ? Theme.Text : Theme.Dim,
                            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                }
                using (var f = active ? Theme.UiSemi(10f) : Theme.Ui(10f))
                    TextRenderer.DrawText(g, RailSteps[i], f, new Point(Theme.S(68), y + Theme.S(1)), active || done ? Theme.Text : Theme.Dim, TextFormatFlags.NoPadding);
                using (var f = Theme.Ui(8f))
                    TextRenderer.DrawText(g, RailHints[i], f, new Point(Theme.S(68), y + Theme.S(21)), active ? Theme.Muted : done ? Theme.Dim : Theme.Faint, TextFormatFlags.NoPadding);
            }

            // footer: panel + version
            int fy = rail.Height - Theme.S(66);
            using (var pen = new Pen(Color.FromArgb(30, 30, 34))) g.DrawLine(pen, Theme.S(28), fy - Theme.S(16), rail.Width - Theme.S(28), fy - Theme.S(16));
            using (var f = Theme.UiSemi(7f))
                TextRenderer.DrawText(g, "PANEL", f, new Point(Theme.S(28), fy), Theme.Dim, TextFormatFlags.NoPadding);
            using (var f = Theme.Mono(8f))
                TextRenderer.DrawText(g, ShortUrl(apiBase), f, new Rectangle(Theme.S(28), fy + Theme.S(16), rail.Width - Theme.S(48), Theme.S(18)), Theme.Muted,
                    TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
            using (var f = Theme.Ui(7.5f))
                TextRenderer.DrawText(g, "v" + Program.Version, f, new Point(Theme.S(28), fy + Theme.S(36)), Theme.Faint, TextFormatFlags.NoPadding);
        }

        static string ShortUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return "not set";
            return Regex.Replace(url, "^https?://", "");
        }

        void ShowStep(int s)
        {
            step = s;
            keyPage.Visible = s == 0;
            folderPage.Visible = s == 1;
            installPage.Visible = s == 2;
            donePage.Visible = s == 3;
            rail.Invalidate();
            if (s == 0)
            {
                if (IsHandleCreated) BeginInvoke((Action)(() => keyBox.Box.Focus()));
                else ActiveControl = keyBox.Box;
            }
            if (s == 1 && cards.Controls.Count == 0) StartScan();
        }

        // --------------------------------------------------------------- helpers

        TextLabel AddLabel(Panel p, string text, Font font, Color color, int x, int y, int w, int h)
        {
            var l = new TextLabel(text, font, color) { Bounds = new Rectangle(x, y, w, h) };
            l.MouseDown += Drag;
            p.Controls.Add(l);
            return l;
        }

        void Header(Panel p, string eyebrow, string title, string body)
        {
            AddLabel(p, eyebrow, Theme.UiSemi(7.5f), Theme.Dim, 0, 0, p.Width, Theme.S(18));
            AddLabel(p, title, Theme.UiSemi(19f), Theme.Text, -Theme.S(2), Theme.S(20), p.Width, Theme.S(44));
            AddLabel(p, body, Theme.Ui(9.75f), Theme.Muted, 0, Theme.S(66), p.Width - Theme.S(20), Theme.S(44));
        }

        // --------------------------------------------------------------- step 1

        void BuildKeyPage()
        {
            var p = keyPage;
            Header(p, "STEP 1 OF 3", "Enter your licence key",
                "You find it in the panel (Servers, or Download). The installer fetches everything else — the protected resource and your server token — from the web.");

            keyBox = new InputBox(Theme.Mono(12f)) { Bounds = new Rectangle(0, Theme.S(128), p.Width - Theme.S(110), Theme.S(50)) };
            keyBox.Placeholder = "COREAC-XXXX-XXXX-XXXX-XXXX";
            keyBox.Box.CharacterCasing = CharacterCasing.Upper;
            keyBox.Box.MaxLength = 80;
            keyBox.Box.TextChanged += delegate
            {
                keyBox.Invalid = false;
                keyBox.Invalidate();
                if (keyInfo != null && keyBox.Text.Trim() != key) ResetKey();
                keyNext.Enabled = keyBox.Text.Trim().Length >= 10;
            };
            keyBox.Box.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; keyNext.PerformClick(); } };
            p.Controls.Add(keyBox);

            pasteBtn = new FlatButton("Paste", ButtonKind.Secondary) { Bounds = new Rectangle(p.Width - Theme.S(100), Theme.S(128), Theme.S(100), Theme.S(50)) };
            pasteBtn.Click += delegate
            {
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        var m = Regex.Match(Clipboard.GetText(), @"[A-Za-z]{3,8}(-[A-Za-z0-9]{3,8}){2,6}");
                        keyBox.Text = m.Success ? m.Value.ToUpperInvariant() : Clipboard.GetText().Trim();
                    }
                }
                catch (Exception) { }
            };
            p.Controls.Add(pasteBtn);

            keyStatus = AddLabel(p, "", Theme.Ui(9f), Theme.Muted, 0, Theme.S(186), p.Width, Theme.S(40));

            keyResult = new Panel { Bounds = new Rectangle(0, Theme.S(226), p.Width, Theme.S(214)), BackColor = Theme.Bg, Visible = false };
            keyResult.AutoScroll = true;
            DarkScrollbars(keyResult);
            p.Controls.Add(keyResult);

            apiLabel = AddLabel(p, "", Theme.Ui(8.5f), Theme.Dim, 0, p.Height - Theme.S(30), Theme.S(300), Theme.S(20));
            apiLabel.AutoSize = true;
            apiChange = new LinkLabel
            {
                Text = "Change",
                Font = Theme.Ui(8.5f),
                LinkColor = Theme.Muted,
                ActiveLinkColor = Theme.Text,
                LinkBehavior = LinkBehavior.HoverUnderline,
                BackColor = Color.Transparent,
                AutoSize = true,
                Location = new Point(Theme.S(200), p.Height - Theme.S(30))
            };
            apiChange.LinkClicked += delegate { ToggleApiBox(); };
            p.Controls.Add(apiChange);
            apiBox = new InputBox(Theme.Mono(9.5f)) { Bounds = new Rectangle(0, p.Height - Theme.S(86), p.Width - Theme.S(150), Theme.S(40)), Visible = false };
            apiBox.Placeholder = "https://panel.example.com";
            p.Controls.Add(apiBox);
            UpdateApiLabel();

            keyNext = new FlatButton("Check key", ButtonKind.Primary) { Bounds = new Rectangle(p.Width - Theme.S(140), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)), Enabled = false };
            keyNext.Click += async delegate { await OnKeyNext(); };
            p.Controls.Add(keyNext);
            AcceptButton = null;
        }

        void UpdateApiLabel()
        {
            apiLabel.Text = string.IsNullOrEmpty(apiBase) ? "No panel address set." : "Connects to " + ShortUrl(apiBase);
            apiChange.Left = apiLabel.Left + apiLabel.PreferredWidth + Theme.S(6);
        }

        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
        static extern int SetWindowTheme(IntPtr hwnd, string app, string idList);

        /// <summary>Dark native scrollbars (Windows 10 1809+); light ones elsewhere.</summary>
        static void DarkScrollbars(Control c)
        {
            EventHandler apply = delegate
            {
                try { SetWindowTheme(c.Handle, "DarkMode_Explorer", null); } catch (Exception) { }
            };
            if (c.IsHandleCreated) apply(c, EventArgs.Empty);
            else c.HandleCreated += apply;
        }

        void ToggleApiBox()
        {
            apiBox.Visible = !apiBox.Visible;
            if (apiBox.Visible)
            {
                apiBox.Text = apiBase ?? "";
                apiBox.Box.Focus();
                apiChange.Text = "Save";
            }
            else
            {
                string v = apiBox.Text.Trim().TrimEnd('/');
                if (Regex.IsMatch(v, @"^https?://[^\s/]+(:\d+)?$", RegexOptions.IgnoreCase))
                {
                    apiBase = v;
                    ResetKey();
                }
                apiChange.Text = "Change";
                UpdateApiLabel();
                rail.Invalidate();
            }
        }

        void ResetKey()
        {
            keyInfo = null;
            server = null;
            keyResult.Visible = false;
            keyResult.Controls.Clear();
            keyNext.Text = "Check key";
            keyStatus.Text = "";
        }

        async Task OnKeyNext()
        {
            if (keyInfo != null && server != null)
            {
                ShowStep(1);
                return;
            }
            if (string.IsNullOrEmpty(apiBase))
            {
                keyStatus.ForeColor = Theme.Red;
                keyStatus.Text = "Set the panel address first (Change panel address, bottom left).";
                return;
            }
            key = keyBox.Text.Trim();
            keyNext.Enabled = false;
            keyBox.Enabled = false;
            keyStatus.ForeColor = Theme.Muted;
            keyStatus.Text = "Checking with " + ShortUrl(apiBase) + "…";
            try
            {
                using (var api = new PanelApi(apiBase))
                    keyInfo = await api.CheckKey(key, CancellationToken.None);
                server = keyInfo.Servers.Count == 1 ? keyInfo.Servers[0] : null;
                ShowKeyResult();
                keyStatus.ForeColor = Theme.Green;
                keyStatus.Text = "✓  Licence is valid" + (keyInfo.Servers.Count > 1 ? " — pick the server you are installing." : ".");
                keyNext.Text = "Continue";
            }
            catch (PanelException ex)
            {
                keyBox.Invalid = ex.Status >= 400 && ex.Status < 500;
                keyBox.Invalidate();
                keyStatus.ForeColor = Theme.Red;
                keyStatus.Text = ex.Message;
                keyInfo = null;
            }
            catch (Exception ex)
            {
                keyStatus.ForeColor = Theme.Red;
                keyStatus.Text = ex.Message;
                keyInfo = null;
            }
            finally
            {
                keyBox.Enabled = true;
                keyNext.Enabled = keyInfo == null ? keyBox.Text.Trim().Length >= 10 : server != null;
            }
        }

        void ShowKeyResult()
        {
            keyResult.Controls.Clear();
            string expiry = string.IsNullOrEmpty(keyInfo.ExpiresAt) ? "lifetime licence" : "valid until " + FormatDate(keyInfo.ExpiresAt);
            // Room for a vertical scrollbar so a long list never scrolls sideways.
            int w = keyResult.Width - SystemInformation.VerticalScrollBarWidth - Theme.S(2);
            if (keyInfo.Servers.Count == 1)
            {
                var s0 = keyInfo.Servers[0];
                var one = new ChoiceCard
                {
                    Title = s0.Name,
                    Subtitle = (keyInfo.Product ?? "CoreAC") + "  ·  " + MaskKey(key),
                    Detail = Capitalise(expiry) + "  ·  " + (s0.InstalledVersion != null ? "CoreAC " + s0.InstalledVersion + " installed" : "not installed yet"),
                    Bounds = new Rectangle(0, 0, w, Theme.S(76)),
                    Selected = true,
                    Cursor = Cursors.Default,
                    Payload = s0
                };
                AddServerTags(one, s0);
                keyResult.Controls.Add(one);
                keyResult.Visible = true;
                return;
            }

            var summary = new TextLabel((keyInfo.Product ?? "CoreAC") + "  ·  " + expiry + "  ·  " + keyInfo.Servers.Count + " servers on this key",
                Theme.Ui(8.5f), Theme.Dim) { Bounds = new Rectangle(0, 0, w, Theme.S(20)) };
            keyResult.Controls.Add(summary);
            int y = Theme.S(26);
            {
                foreach (var s in keyInfo.Servers)
                {
                    var card = new ChoiceCard
                    {
                        Title = s.Name,
                        Subtitle = s.InstalledVersion != null ? "CoreAC " + s.InstalledVersion + " installed" : "Not installed yet",
                        Detail = s.LastSeenAt != null ? "Last connected " + FormatDate(s.LastSeenAt) : "Never connected",
                        Bounds = new Rectangle(0, y, w, Theme.S(76)),
                        Payload = s
                    };
                    AddServerTags(card, s);
                    card.Picked += delegate
                    {
                        server = (ServerInfo)card.Payload;
                        foreach (Control c in keyResult.Controls)
                        {
                            var cc = c as ChoiceCard;
                            if (cc != null && cc.Payload != null) cc.Selected = cc == card;
                        }
                        keyNext.Enabled = true;
                    };
                    keyResult.Controls.Add(card);
                    y += Theme.S(84);
                }
            }
            keyResult.Visible = true;
        }

        static void AddServerTags(ChoiceCard card, ServerInfo s)
        {
            if (s.Online) card.Tags.Add(new KeyValuePair<string, Color>("ONLINE", Theme.Green));
            else card.Tags.Add(new KeyValuePair<string, Color>("OFFLINE", Theme.Muted));
        }

        static string Capitalise(string s)
        {
            return string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
        }

        static string MaskKey(string k)
        {
            var parts = k.Split('-');
            if (parts.Length < 3) return k;
            for (int i = 1; i < parts.Length - 1; i++) parts[i] = new string('•', parts[i].Length);
            return string.Join("-", parts);
        }

        static string FormatDate(string iso)
        {
            DateTime d;
            if (DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out d))
                return d.ToLocalTime().ToString("d MMM yyyy, HH:mm");
            return iso;
        }

        // --------------------------------------------------------------- step 2

        void BuildFolderPage()
        {
            var p = folderPage;
            Header(p, "STEP 2 OF 3", "Where is your FiveM server?",
                "We look for server.cfg on this PC — next to this installer, in txAdmin and on your drives. Pick the right one or browse to it.");

            scanStatus = AddLabel(p, "", Theme.Ui(8.75f), Theme.Muted, 0, Theme.S(118), p.Width - Theme.S(230), Theme.S(20));
            scanBar = new ProgressLine { Bounds = new Rectangle(0, Theme.S(142), p.Width, Theme.S(3)) };
            p.Controls.Add(scanBar);

            rescanBtn = new FlatButton("Search again", ButtonKind.Ghost) { Bounds = new Rectangle(p.Width - Theme.S(226), Theme.S(110), Theme.S(110), Theme.S(30)), Font = Theme.Ui(8.75f) };
            rescanBtn.Click += delegate { StartScan(); };
            p.Controls.Add(rescanBtn);
            browseBtn = new FlatButton("Browse…", ButtonKind.Secondary) { Bounds = new Rectangle(p.Width - Theme.S(110), Theme.S(110), Theme.S(110), Theme.S(30)), Font = Theme.Ui(8.75f) };
            browseBtn.Click += delegate { Browse(); };
            p.Controls.Add(browseBtn);

            cards = new Panel { Bounds = new Rectangle(0, Theme.S(156), p.Width, p.Height - Theme.S(156) - Theme.S(118)), BackColor = Theme.Bg, AutoScroll = true };
            DarkScrollbars(cards);
            p.Controls.Add(cards);

            stealth = new ToggleRow
            {
                Caption = "Hidden folder name (recommended)",
                Description = "Installs under a random name like qx_7k2m9d4a so cheat menus cannot find the anti-cheat by name.",
                Bounds = new Rectangle(0, p.Height - Theme.S(104), p.Width, Theme.S(46)),
                Checked = true
            };
            p.Controls.Add(stealth);

            folderBack = new FlatButton("Back", ButtonKind.Ghost) { Bounds = new Rectangle(0, p.Height - Theme.S(42), Theme.S(90), Theme.S(42)) };
            folderBack.Click += delegate { ShowStep(0); };
            p.Controls.Add(folderBack);
            folderNext = new FlatButton("Install", ButtonKind.Primary) { Bounds = new Rectangle(p.Width - Theme.S(140), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)), Enabled = false };
            folderNext.Click += async delegate { await StartInstall(); };
            p.Controls.Add(folderNext);
        }

        async void StartScan()
        {
            if (scanCts != null) scanCts.Cancel();
            scanCts = new CancellationTokenSource();
            var ct = scanCts.Token;
            cards.Controls.Clear();
            target = null;
            folderNext.Enabled = false;
            scanBar.Visible = true;
            scanBar.Indeterminate = true;
            rescanBtn.Enabled = false;
            scanStatus.ForeColor = Theme.Muted;
            scanStatus.Text = "Searching…";
            List<ServerCandidate> found;
            try
            {
                found = await Task.Run(() => ServerFinder.Find(s => BeginInvoke((Action)(() => { if (!ct.IsCancellationRequested) scanStatus.Text = Ellipsis(s, 70); })), ct), ct);
            }
            catch (OperationCanceledException) { return; }
            if (ct.IsCancellationRequested) return;
            scanBar.Indeterminate = false;
            scanBar.Visible = false;
            rescanBtn.Enabled = true;
            if (found.Count == 0)
            {
                scanStatus.ForeColor = Theme.Amber;
                scanStatus.Text = "No server.cfg found automatically — use Browse… and pick your server folder.";
                return;
            }
            scanStatus.ForeColor = Theme.Muted;
            scanStatus.Text = found.Count == 1 ? "Found 1 server." : "Found " + found.Count + " servers — the most likely one is selected.";
            foreach (var c in found) AddCandidate(c);
            Pick(found[0]);
        }

        static string Ellipsis(string s, int max)
        {
            return s.Length <= max ? s : "…" + s.Substring(s.Length - max + 1);
        }

        void AddCandidate(ServerCandidate c)
        {
            foreach (Control ctl in cards.Controls)
            {
                var existing = ctl as ChoiceCard;
                if (existing != null && string.Equals(((ServerCandidate)existing.Payload).CfgPath, c.CfgPath, StringComparison.OrdinalIgnoreCase)) return;
            }
            var card = new ChoiceCard
            {
                Title = string.IsNullOrEmpty(c.Hostname) ? Path.GetFileName(c.Root) : c.Hostname,
                Subtitle = c.CfgPath,
                Detail = (c.ResourceCount > 0 ? c.ResourceCount + " resources" : "no resources folder yet")
                    + "  ·  server.cfg edited " + c.CfgModified.ToString("d MMM yyyy"),
                Payload = c,
                Bounds = new Rectangle(0, cards.Controls.Count * Theme.S(84), cards.Width - SystemInformation.VerticalScrollBarWidth - Theme.S(2), Theme.S(76))
            };
            if (c.InstalledAs != null) card.Tags.Add(new KeyValuePair<string, Color>("COREAC INSTALLED", Theme.Green));
            if (c.FromTxAdmin) card.Tags.Add(new KeyValuePair<string, Color>("TXADMIN", Theme.Muted));
            if (c.NearInstaller) card.Tags.Add(new KeyValuePair<string, Color>("HERE", Theme.Muted));
            card.Picked += delegate { Pick((ServerCandidate)card.Payload); };
            cards.Controls.Add(card);
        }

        void Pick(ServerCandidate c)
        {
            target = c;
            foreach (Control ctl in cards.Controls)
            {
                var card = ctl as ChoiceCard;
                if (card != null) card.Selected = card.Payload == c;
            }
            folderNext.Enabled = true;
            folderNext.Text = c.InstalledAs != null ? "Update" : "Install";
            stealth.Enabled = c.InstalledAs == null;
            stealth.Description = c.InstalledAs != null
                ? "Updating the existing install in resources\\" + c.InstalledAs + " — the folder name stays."
                : "Installs under a random name like qx_7k2m9d4a so cheat menus cannot find the anti-cheat by name.";
            stealth.Invalidate();
        }

        void Browse()
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = "Pick your FiveM server folder — the one with server.cfg in it.";
                dlg.ShowNewFolderButton = false;
                if (target != null) dlg.SelectedPath = target.Root;
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                var c = ServerFinder.FromPicked(dlg.SelectedPath);
                if (c == null)
                {
                    using (var file = new OpenFileDialog { Title = "No server.cfg there — pick the config file itself", Filter = "FiveM config (*.cfg)|*.cfg|All files (*.*)|*.*", InitialDirectory = dlg.SelectedPath })
                    {
                        if (file.ShowDialog(this) != DialogResult.OK) return;
                        c = ServerFinder.Inspect(file.FileName);
                        if (c == null)
                        {
                            scanStatus.ForeColor = Theme.Red;
                            scanStatus.Text = "That file does not look like a FiveM server.cfg.";
                            return;
                        }
                    }
                }
                if (scanCts != null) scanCts.Cancel();
                scanBar.Indeterminate = false;
                scanBar.Visible = false;
                rescanBtn.Enabled = true;
                AddCandidate(c);
                // Scroll the picked card into view and select it.
                foreach (Control ctl in cards.Controls)
                {
                    var card = ctl as ChoiceCard;
                    if (card != null && string.Equals(((ServerCandidate)card.Payload).CfgPath, c.CfgPath, StringComparison.OrdinalIgnoreCase))
                    {
                        cards.ScrollControlIntoView(card);
                        Pick((ServerCandidate)card.Payload);
                    }
                }
                scanStatus.ForeColor = Theme.Muted;
                scanStatus.Text = "Using " + Ellipsis(c.CfgPath, 64);
            }
        }

        // --------------------------------------------------------------- step 3

        bool installBusy;
        CancellationTokenSource installCts;

        void BuildInstallPage()
        {
            var p = installPage;
            AddLabel(p, "STEP 3 OF 3", Theme.UiSemi(7.5f), Theme.Dim, 0, 0, p.Width, Theme.S(18));
            installTitle = AddLabel(p, "Installing CoreAC", Theme.UiSemi(19f), Theme.Text, -Theme.S(2), Theme.S(20), p.Width, Theme.S(44));
            installSub = AddLabel(p, "", Theme.Ui(9.5f), Theme.Muted, 0, Theme.S(66), p.Width, Theme.S(22));

            installBar = new ProgressLine { Bounds = new Rectangle(0, Theme.S(100), p.Width, Theme.S(4)) };
            p.Controls.Add(installBar);

            steps = new StepList { Bounds = new Rectangle(0, Theme.S(124), p.Width, Theme.S(270)) };
            foreach (var s in InstallEngine.StepNames) steps.Add(s);
            p.Controls.Add(steps);

            installError = AddLabel(p, "", Theme.Ui(9f), Theme.Red, 0, Theme.S(392), p.Width, Theme.S(44));
            installError.Visible = false;

            logBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BorderStyle = BorderStyle.None,
                BackColor = Theme.Input,
                ForeColor = Theme.Muted,
                Font = Theme.Mono(8f),
                Bounds = new Rectangle(0, Theme.S(124), p.Width, Theme.S(260)),
                Visible = false
            };
            DarkScrollbars(logBox);
            p.Controls.Add(logBox);

            logToggle = new LinkLabel
            {
                Text = "Show details",
                Font = Theme.Ui(8.5f),
                LinkColor = Theme.Muted,
                ActiveLinkColor = Theme.Text,
                LinkBehavior = LinkBehavior.HoverUnderline,
                BackColor = Color.Transparent,
                AutoSize = true,
                Location = new Point(0, p.Height - Theme.S(30))
            };
            logToggle.LinkClicked += delegate
            {
                logBox.Visible = !logBox.Visible;
                steps.Visible = !logBox.Visible;
                logToggle.Text = logBox.Visible ? "Hide details" : "Show details";
                if (logBox.Visible) { logBox.SelectionStart = logBox.TextLength; logBox.ScrollToCaret(); }
            };
            p.Controls.Add(logToggle);

            installBack = new FlatButton("Back", ButtonKind.Ghost) { Bounds = new Rectangle(p.Width - Theme.S(380), p.Height - Theme.S(42), Theme.S(90), Theme.S(42)), Visible = false };
            installBack.Click += delegate { ShowStep(1); };
            p.Controls.Add(installBack);
            adminBtn = new FlatButton("Run as administrator", ButtonKind.Secondary) { Bounds = new Rectangle(p.Width - Theme.S(290), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)), Visible = false, Font = Theme.Ui(8.75f) };
            adminBtn.Click += delegate { RestartElevated(); };
            p.Controls.Add(adminBtn);
            retryBtn = new FlatButton("Try again", ButtonKind.Primary) { Bounds = new Rectangle(p.Width - Theme.S(140), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)), Visible = false };
            retryBtn.Click += async delegate { await StartInstall(); };
            p.Controls.Add(retryBtn);
        }

        void AppendLog(string line)
        {
            logLines.Add(line);
            logBox.AppendText(line + Environment.NewLine);
        }

        async Task StartInstall()
        {
            if (target == null || server == null) return;
            ShowStep(2);
            installBusy = true;
            installCts = new CancellationTokenSource();
            steps.Reset();
            installBar.Value = 0;
            installError.Visible = false;
            retryBtn.Visible = false;
            adminBtn.Visible = false;
            installBack.Visible = false;
            installTitle.Text = target.InstalledAs != null ? "Updating CoreAC" : "Installing CoreAC";
            installSub.Text = server.Name + "  ·  " + Ellipsis(target.Root, 60);
            rail.Invalidate();

            var engine = new InstallEngine();
            engine.OnStep = (i, s, d) => BeginInvoke((Action)(() => steps.Set(i, s, d)));
            engine.OnLog = l => BeginInvoke((Action)(() => AppendLog(l)));
            engine.OnProgress = v => BeginInvoke((Action)(() => installBar.Value = v));
            var opts = new InstallOptions { Key = key, ServerId = server.Id, CfgPath = target.CfgPath, Stealth = stealth.Checked };

            Exception failure = null;
            try
            {
                using (var api = new PanelApi(apiBase))
                    lastResult = await Task.Run(() => engine.Run(api, opts, installCts.Token));
            }
            catch (Exception ex)
            {
                failure = ex;
            }
            installBusy = false;
            if (failure == null)
            {
                await Task.Delay(450);
                ShowDone();
                return;
            }
            bool denied = failure is UnauthorizedAccessException || (failure.InnerException is UnauthorizedAccessException);
            installTitle.Text = "Installation stopped";
            bool cfgWritten = steps.States.Count > 4 && steps.States[4] == StepState.Done;
            installError.Text = failure.Message + (cfgWritten ? "" : "  Your server.cfg was not changed.");
            installError.Visible = !logBox.Visible;
            retryBtn.Visible = true;
            installBack.Visible = true;
            adminBtn.Visible = denied && !IsElevated();
            AppendLog("ERROR: " + failure);
        }

        static bool IsElevated()
        {
            try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
            catch (Exception) { return false; }
        }

        void RestartElevated()
        {
            try
            {
                var psi = new ProcessStartInfo(Application.ExecutablePath)
                {
                    UseShellExecute = true,
                    Verb = "runas",
                    Arguments = "--api \"" + apiBase + "\" --key \"" + key + "\""
                };
                Process.Start(psi);
                Close();
            }
            catch (Exception) { /* the user said no to UAC */ }
        }

        // --------------------------------------------------------------- done

        void BuildDonePage()
        {
            var p = donePage;
            var badge = new Panel { Bounds = new Rectangle(0, Theme.S(6), Theme.S(64), Theme.S(64)), BackColor = Theme.Bg };
            badge.Paint += (s, e) =>
            {
                Theme.Hq(e.Graphics);
                var r = new RectangleF(1, 1, badge.Width - 2, badge.Height - 2);
                using (var b = new SolidBrush(Color.FromArgb(28, Theme.Green))) e.Graphics.FillEllipse(b, r);
                using (var pen = new Pen(Color.FromArgb(90, Theme.Green), 1.2f)) e.Graphics.DrawEllipse(pen, r);
                Theme.DrawCheck(e.Graphics, Theme.Green, RectangleF.Inflate(r, -Theme.S(17), -Theme.S(17)), 3f * Theme.Scale);
            };
            p.Controls.Add(badge);
            AddLabel(p, "CoreAC is installed", Theme.UiSemi(20f), Theme.Text, -Theme.S(2), Theme.S(86), p.Width, Theme.S(44));
            AddLabel(p, "Restart your FiveM server (or run “ensure” for the folder below). It shows ONLINE in the panel within a minute.",
                Theme.Ui(9.75f), Theme.Muted, 0, Theme.S(132), p.Width - Theme.S(20), Theme.S(44));
            doneSummary = AddLabel(p, "", Theme.Mono(8.75f), Theme.Text, 0, Theme.S(196), p.Width, Theme.S(150));

            var openFolder = new FlatButton("Open server folder", ButtonKind.Secondary) { Bounds = new Rectangle(0, p.Height - Theme.S(42), Theme.S(160), Theme.S(42)) };
            openFolder.Click += delegate { if (lastResult != null) Process.Start("explorer.exe", "\"" + Path.GetDirectoryName(lastResult.CfgPath) + "\""); };
            p.Controls.Add(openFolder);
            var openPanel = new FlatButton("Open the panel", ButtonKind.Secondary) { Bounds = new Rectangle(Theme.S(170), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)) };
            openPanel.Click += delegate
            {
                try { Process.Start(apiBase.TrimEnd('/') + "/dashboard"); } catch (Exception) { }
            };
            p.Controls.Add(openPanel);
            var finish = new FlatButton("Finish", ButtonKind.Primary) { Bounds = new Rectangle(p.Width - Theme.S(140), p.Height - Theme.S(42), Theme.S(140), Theme.S(42)) };
            finish.Click += delegate { Close(); };
            p.Controls.Add(finish);
        }

        void ShowDone()
        {
            var r = lastResult;
            var lines = new List<string>
            {
                "Server        " + (r.ServerName ?? server.Name),
                "Resource      resources\\" + r.ResourceName + (r.Updated ? "   (updated in place)" : ""),
                "server.cfg    " + Ellipsis(r.CfgPath, 58),
                "Backup        " + Path.GetFileName(r.BackupPath)
            };
            if (r.RemovedLegacy.Count > 0) lines.Add("Removed       " + r.RemovedLegacy.Count + " old Aeigs install(s)");
            doneSummary.Text = string.Join(Environment.NewLine + Environment.NewLine, lines);
            ShowStep(3);
        }

        // ---------------------------------------------------- design snapshots

        /// <summary>Renders every screen with sample data to PNGs (build check, no network).</summary>
        public void RenderSnapshots(string dir)
        {
            Directory.CreateDirectory(dir);
            CreateControl();
            Action<string> shot = name =>
            {
                Application.DoEvents();
                using (var bmp = new Bitmap(Width, Height))
                {
                    DrawToBitmap(bmp, new Rectangle(0, 0, Width, Height));
                    bmp.Save(Path.Combine(dir, name + ".png"), System.Drawing.Imaging.ImageFormat.Png);
                }
            };
            ShowStep(0);
            shot("1-key-empty");
            keyBox.Text = "COREAC-7K3Q-P9XZ-M2LD-QW8E";
            key = keyBox.Text;
            keyInfo = new KeyInfo { Product = "CoreAC Pro", ExpiresAt = null };
            keyInfo.Servers.Add(new ServerInfo { Id = "a", Name = "Los Santos RP", Online = true, InstalledVersion = "4.7.0", LastSeenAt = DateTime.UtcNow.AddMinutes(-3).ToString("o") });
            keyInfo.Servers.Add(new ServerInfo { Id = "b", Name = "Vice City RP", Online = false, LastSeenAt = null });
            ShowKeyResult();
            keyStatus.ForeColor = Theme.Green;
            keyStatus.Text = "✓  Licence is valid — pick the server you are installing.";
            keyNext.Text = "Continue";
            shot("2-key-servers");

            server = keyInfo.Servers[0];
            step = 1;
            keyPage.Visible = false;
            folderPage.Visible = true;
            rail.Invalidate();
            scanStatus.Text = "Found 2 servers — the most likely one is selected.";
            scanBar.Visible = false;
            var c1 = new ServerCandidate { CfgPath = @"C:\FXServer\txData\QBCore_8F2A1C.base\server.cfg", Root = @"C:\FXServer\txData\QBCore_8F2A1C.base", Hostname = "Los Santos RP | Serious RP", ResourceCount = 84, InstalledAs = "qx_7k2m9d4a", FromTxAdmin = true, CfgModified = DateTime.Now.AddDays(-2) };
            var c2 = new ServerCandidate { CfgPath = @"D:\Servers\vice-city\server-data\server.cfg", Root = @"D:\Servers\vice-city\server-data", Hostname = "Vice City RP", ResourceCount = 41, CfgModified = DateTime.Now.AddDays(-40) };
            AddCandidate(c1);
            AddCandidate(c2);
            Pick(c1);
            shot("3-folder");

            step = 2;
            folderPage.Visible = false;
            installPage.Visible = true;
            rail.Invalidate();
            installSub.Text = "Los Santos RP  ·  C:\\FXServer\\txData\\QBCore_8F2A1C.base";
            steps.Set(0, StepState.Done, "742 KB");
            steps.Set(1, StepState.Done, "118 files");
            steps.Set(2, StepState.Done, "resources\\qx_7k2m9d4a (updated in place)");
            steps.Set(3, StepState.Running, "Issuing a server token…");
            installBar.Value = 0.78;
            shot("4-install");

            lastResult = new InstallResult
            {
                ServerName = "Los Santos RP",
                ResourceName = "qx_7k2m9d4a",
                CfgPath = c1.CfgPath,
                BackupPath = c1.CfgPath + ".coreac.bak",
                Updated = true
            };
            ShowDone();
            shot("5-done");
        }
    }
}
