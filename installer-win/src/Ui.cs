// CoreAC Setup — owner-drawn controls (WinForms' stock ones look like 2005 on
// a dark window). All sizes go through Theme.S() for high-DPI screens.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace CoreAcSetup
{
    enum ButtonKind { Primary, Secondary, Ghost, Danger }

    class FlatButton : Control, IButtonControl
    {
        public ButtonKind Kind = ButtonKind.Primary;
        bool hover, down;

        public FlatButton(string text, ButtonKind kind)
        {
            Text = text;
            Kind = kind;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor | ControlStyles.Selectable, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
            Font = Theme.UiSemi(9.5f);
            Size = new Size(Theme.S(120), Theme.S(38));
            TabStop = true;
        }

        public DialogResult DialogResult { get; set; }
        public void NotifyDefault(bool value) { }
        public void PerformClick() { if (Enabled && Visible) OnClick(EventArgs.Empty); }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) { PerformClick(); e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            float rad = Theme.S(9);
            Color fill, border, text;
            switch (Kind)
            {
                case ButtonKind.Primary:
                    fill = down ? Color.FromArgb(212, 212, 216) : hover ? Color.FromArgb(232, 232, 236) : Theme.White;
                    border = fill;
                    text = Theme.Black;
                    break;
                case ButtonKind.Danger:
                    fill = down ? Color.FromArgb(190, 60, 70) : hover ? Color.FromArgb(232, 92, 100) : Color.FromArgb(220, 76, 86);
                    border = fill;
                    text = Color.White;
                    break;
                case ButtonKind.Secondary:
                    fill = down ? Color.FromArgb(34, 34, 38) : hover ? Color.FromArgb(28, 28, 32) : Color.FromArgb(21, 21, 24);
                    border = hover ? Theme.BorderHover : Theme.Border;
                    text = Theme.Text;
                    break;
                default:
                    fill = down ? Color.FromArgb(28, 28, 32) : hover ? Color.FromArgb(22, 22, 25) : Color.Transparent;
                    border = fill;
                    text = hover ? Theme.Text : Theme.Muted;
                    break;
            }
            if (!Enabled)
            {
                fill = Kind == ButtonKind.Primary || Kind == ButtonKind.Danger ? Color.FromArgb(46, 46, 50) : fill;
                border = Kind == ButtonKind.Primary || Kind == ButtonKind.Danger ? fill : Theme.Border;
                text = Theme.Dim;
            }
            if (fill.A > 0) Theme.FillRound(g, fill, r, rad);
            if (border != fill) Theme.StrokeRound(g, border, r, rad, 1f);
            if (Focused && ShowFocusCues) Theme.StrokeRound(g, Theme.BorderFocus, RectangleF.Inflate(r, -2, -2), rad - 2, 1f);
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, text,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
        }
    }

    /// <summary>A rounded single-line text field (a borderless TextBox inside a painted frame).</summary>
    class InputBox : Control
    {
        public readonly TextBox Box;
        bool hover;
        public bool Invalid;

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);

        public InputBox(Font font)
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Input;
            Box = new TextBox
            {
                BorderStyle = BorderStyle.None,
                BackColor = Theme.Input,
                ForeColor = Theme.Text,
                Font = font
            };
            Controls.Add(Box);
            Box.GotFocus += delegate { Invalidate(); };
            Box.LostFocus += delegate { Invalidate(); };
            Box.MouseEnter += delegate { hover = true; Invalidate(); };
            Box.MouseLeave += delegate { hover = false; Invalidate(); };
            Cursor = Cursors.IBeam;
            Size = new Size(Theme.S(360), Theme.S(44));
        }

        public string Placeholder
        {
            set
            {
                // EM_SETCUEBANNER: grey hint text Windows draws while the box is empty.
                if (Box.IsHandleCreated) SendMessage(Box.Handle, 0x1501, (IntPtr)1, value);
                else Box.HandleCreated += delegate { SendMessage(Box.Handle, 0x1501, (IntPtr)1, value); };
            }
        }

        public override string Text
        {
            get { return Box.Text; }
            set { Box.Text = value; }
        }

        protected override void OnMouseDown(MouseEventArgs e) { Box.Focus(); base.OnMouseDown(e); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnLayout(LayoutEventArgs e)
        {
            base.OnLayout(e);
            int pad = Theme.S(14);
            Box.Width = Width - pad * 2;
            Box.Location = new Point(pad, (Height - Box.Height) / 2);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Theme.FillRound(g, Theme.Input, r, Theme.S(10));
            Color border = Invalid ? Theme.Red : Box.Focused ? Theme.BorderFocus : hover ? Theme.BorderHover : Theme.Border;
            Theme.StrokeRound(g, border, r, Theme.S(10), 1f);
        }
    }

    /// <summary>A selectable card: radio dot, title, mono subtitle and small tags.</summary>
    class ChoiceCard : Control
    {
        public string Title = "";
        public string Subtitle = "";
        public string Detail = "";
        public List<KeyValuePair<string, Color>> Tags = new List<KeyValuePair<string, Color>>();
        public object Payload;
        bool selected, hover;
        public event EventHandler Picked;

        public ChoiceCard()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            Cursor = Cursors.Hand;
            Height = Theme.S(76);
        }

        public bool Selected
        {
            get { return selected; }
            set { selected = value; Invalidate(); }
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            if (Picked != null) Picked(this, EventArgs.Empty);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Theme.FillRound(g, selected ? Color.FromArgb(24, 24, 27) : hover ? Theme.CardHover : Theme.Card, r, Theme.S(12));
            Theme.StrokeRound(g, selected ? Color.FromArgb(200, 200, 206) : hover ? Theme.BorderHover : Theme.Border, r, Theme.S(12), selected ? 1.4f : 1f);

            // radio
            float d = Theme.S(16);
            var dot = new RectangleF(Theme.S(16), (Height - d) / 2f, d, d);
            using (var pen = new Pen(selected ? Theme.White : Theme.Faint, 1.6f)) g.DrawEllipse(pen, dot);
            if (selected)
            {
                var inner = RectangleF.Inflate(dot, -Theme.S(4), -Theme.S(4));
                using (var b = new SolidBrush(Theme.White)) g.FillEllipse(b, inner);
            }

            int x = Theme.S(46);
            int right = Width - Theme.S(16);
            // tags (right aligned, on the title line)
            int tx = right;
            using (var tagFont = Theme.UiSemi(7.5f))
            {
                for (int i = Tags.Count - 1; i >= 0; i--)
                {
                    var t = Tags[i];
                    var sz = TextRenderer.MeasureText(g, t.Key, tagFont, Size.Empty, TextFormatFlags.NoPadding);
                    var tr = new RectangleF(tx - sz.Width - Theme.S(14), Theme.S(13), sz.Width + Theme.S(14), Theme.S(20));
                    Theme.FillRound(g, Color.FromArgb(28, t.Value), tr, Theme.S(10));
                    Theme.StrokeRound(g, Color.FromArgb(90, t.Value), tr, Theme.S(10), 1f);
                    TextRenderer.DrawText(g, t.Key, tagFont, Rectangle.Round(tr), t.Value,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
                    tx = (int)tr.X - Theme.S(6);
                }
            }

            using (var f = Theme.UiSemi(10.5f))
                TextRenderer.DrawText(g, Title, f, new Rectangle(x, Theme.S(12), tx - x - Theme.S(6), Theme.S(24)), Theme.Text,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
            using (var f = Theme.Mono(8.5f))
                TextRenderer.DrawText(g, Subtitle, f, new Rectangle(x, Theme.S(36), right - x, Theme.S(18)), Theme.Muted,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.PathEllipsis | TextFormatFlags.NoPadding);
            if (!string.IsNullOrEmpty(Detail))
                using (var f = Theme.Ui(8.25f))
                    TextRenderer.DrawText(g, Detail, f, new Rectangle(x, Theme.S(54), right - x, Theme.S(16)), Theme.Dim,
                        TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
        }
    }

    /// <summary>Switch with a label and a one-line explanation.</summary>
    class ToggleRow : Control
    {
        bool on;
        public string Caption = "";
        public string Description = "";
        public event EventHandler Changed;

        public ToggleRow()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            Cursor = Cursors.Hand;
            Height = Theme.S(46);
        }

        public bool Checked
        {
            get { return on; }
            set { on = value; Invalidate(); }
        }

        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }

        protected override void OnClick(EventArgs e)
        {
            if (!Enabled) return;
            on = !on;
            Invalidate();
            if (Changed != null) Changed(this, EventArgs.Empty);
            base.OnClick(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var track = new RectangleF(0.5f, Theme.S(4), Theme.S(36), Theme.S(20));
            Color trackColor = on ? (Enabled ? Theme.White : Color.FromArgb(110, 110, 116)) : Color.FromArgb(38, 38, 42);
            Theme.FillRound(g, trackColor, track, track.Height / 2f);
            float k = track.Height - Theme.S(6);
            var knob = new RectangleF(on ? track.Right - k - Theme.S(3) : track.X + Theme.S(3), track.Y + Theme.S(3), k, k);
            using (var b = new SolidBrush(on ? Theme.Black : Theme.Muted)) g.FillEllipse(b, knob);

            int x = Theme.S(50);
            using (var f = Theme.UiSemi(9.5f))
                TextRenderer.DrawText(g, Caption, f, new Point(x, Theme.S(4)), Enabled ? Theme.Text : Theme.Muted, TextFormatFlags.NoPadding);
            using (var f = Theme.Ui(8.25f))
                TextRenderer.DrawText(g, Description, f, new Rectangle(x, Theme.S(24), Width - x, Theme.S(18)), Theme.Dim,
                    TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
        }
    }

    /// <summary>Thin progress line; Indeterminate shows a sliding segment.</summary>
    class ProgressLine : Control
    {
        double value;
        bool indeterminate;
        float phase;
        readonly Timer timer = new Timer { Interval = 16 };

        public ProgressLine()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            Height = Theme.S(6);
            timer.Tick += delegate { phase = (phase + 0.012f) % 1.4f; Invalidate(); };
        }

        public double Value
        {
            get { return value; }
            set { this.value = Math.Max(0, Math.Min(1, value)); Invalidate(); }
        }

        public bool Indeterminate
        {
            get { return indeterminate; }
            set { indeterminate = value; timer.Enabled = value && Visible; Invalidate(); }
        }

        protected override void OnVisibleChanged(EventArgs e) { timer.Enabled = indeterminate && Visible; base.OnVisibleChanged(e); }
        protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var r = new RectangleF(0, 0, Width, Height);
            Theme.FillRound(g, Color.FromArgb(32, 32, 36), r, Height / 2f);
            if (indeterminate)
            {
                float w = Width * 0.32f;
                float x = (phase - 0.4f) * Width;
                var seg = RectangleF.Intersect(new RectangleF(x, 0, w, Height), r);
                if (seg.Width > 0) Theme.FillRound(g, Theme.White, seg, Height / 2f);
            }
            else if (value > 0)
            {
                Theme.FillRound(g, Theme.White, new RectangleF(0, 0, (float)(Width * value), Height), Height / 2f);
            }
        }
    }

    enum StepState { Pending, Running, Done, Failed, Skipped }

    /// <summary>The install checklist: one row per step with a live state icon.</summary>
    class StepList : Control
    {
        public readonly List<string> Steps = new List<string>();
        public readonly List<StepState> States = new List<StepState>();
        public readonly List<string> Details = new List<string>();
        float spin;
        readonly Timer timer = new Timer { Interval = 30 };

        public StepList()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            timer.Tick += delegate { spin = (spin + 12) % 360; Invalidate(); };
        }

        public void Add(string step)
        {
            Steps.Add(step);
            States.Add(StepState.Pending);
            Details.Add("");
            Height = Steps.Count * Theme.S(44);
        }

        public void Set(int i, StepState s, string detail)
        {
            if (i < 0 || i >= Steps.Count) return;
            States[i] = s;
            if (detail != null) Details[i] = detail;
            timer.Enabled = States.Contains(StepState.Running);
            Invalidate();
        }

        public void Reset()
        {
            for (int i = 0; i < States.Count; i++) { States[i] = StepState.Pending; Details[i] = ""; }
            timer.Enabled = false;
            Invalidate();
        }

        protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            int row = Theme.S(44);
            float d = Theme.S(22);
            using (var title = Theme.Ui(10f))
            using (var detail = Theme.Ui(8.25f))
            {
                for (int i = 0; i < Steps.Count; i++)
                {
                    float y = i * row;
                    var c = new RectangleF(1, y + Theme.S(4), d, d);
                    var st = States[i];
                    if (i < Steps.Count - 1)
                        using (var pen = new Pen(st == StepState.Done ? Color.FromArgb(70, 70, 76) : Color.FromArgb(34, 34, 38), 1.2f))
                            g.DrawLine(pen, c.X + d / 2, c.Bottom + Theme.S(3), c.X + d / 2, y + row + Theme.S(2));
                    switch (st)
                    {
                        case StepState.Done:
                            using (var b = new SolidBrush(Theme.White)) g.FillEllipse(b, c);
                            Theme.DrawCheck(g, Theme.Black, RectangleF.Inflate(c, -Theme.S(4), -Theme.S(4)), 2f * Theme.Scale);
                            break;
                        case StepState.Failed:
                            using (var b = new SolidBrush(Color.FromArgb(60, Theme.Red))) g.FillEllipse(b, c);
                            Theme.DrawCross(g, Theme.Red, RectangleF.Inflate(c, -Theme.S(4), -Theme.S(4)), 2f * Theme.Scale);
                            break;
                        case StepState.Running:
                            using (var pen = new Pen(Color.FromArgb(40, 40, 44), 2.2f * Theme.Scale)) g.DrawEllipse(pen, RectangleF.Inflate(c, -1, -1));
                            using (var pen = new Pen(Theme.White, 2.2f * Theme.Scale))
                            {
                                pen.StartCap = LineCap.Round;
                                pen.EndCap = LineCap.Round;
                                g.DrawArc(pen, RectangleF.Inflate(c, -1, -1), spin, 100);
                            }
                            break;
                        case StepState.Skipped:
                            using (var pen = new Pen(Theme.Faint, 1.4f)) g.DrawEllipse(pen, c);
                            using (var pen = new Pen(Theme.Dim, 1.6f)) g.DrawLine(pen, c.X + d * 0.32f, c.Y + d / 2, c.Right - d * 0.32f, c.Y + d / 2);
                            break;
                        default:
                            using (var pen = new Pen(Theme.Faint, 1.4f)) g.DrawEllipse(pen, c);
                            break;
                    }
                    int x = (int)(c.Right + Theme.S(14));
                    Color tc = st == StepState.Pending ? Theme.Dim : st == StepState.Failed ? Theme.Red : Theme.Text;
                    TextRenderer.DrawText(g, Steps[i], title, new Point(x, (int)y + Theme.S(3)), tc, TextFormatFlags.NoPadding);
                    if (!string.IsNullOrEmpty(Details[i]))
                        TextRenderer.DrawText(g, Details[i], detail, new Rectangle(x, (int)y + Theme.S(23), Width - x, Theme.S(16)),
                            st == StepState.Failed ? Color.FromArgb(220, Theme.Red) : Theme.Dim,
                            TextFormatFlags.Left | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
                }
            }
        }
    }

    /// <summary>Minimise / close glyphs for the borderless window.</summary>
    class TitleButton : Control
    {
        public readonly bool IsClose;
        bool hover;

        public TitleButton(bool close)
        {
            IsClose = close;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
            Size = new Size(Theme.S(40), Theme.S(32));
            Cursor = Cursors.Hand;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Hq(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            if (hover) Theme.FillRound(g, IsClose ? Color.FromArgb(200, 60, 64) : Color.FromArgb(30, 30, 34), new RectangleF(2, 2, Width - 4, Height - 4), Theme.S(8));
            float cx = Width / 2f, cy = Height / 2f, s = Theme.S(5);
            using (var pen = new Pen(hover ? Color.White : Theme.Muted, 1.3f * Theme.Scale))
            {
                if (IsClose)
                {
                    g.DrawLine(pen, cx - s, cy - s, cx + s, cy + s);
                    g.DrawLine(pen, cx + s, cy - s, cx - s, cy + s);
                }
                else
                {
                    g.DrawLine(pen, cx - s, cy, cx + s, cy);
                }
            }
        }
    }

    /// <summary>A label that paints on its parent's colour (no flicker, word wrap).</summary>
    class TextLabel : Label
    {
        public TextLabel(string text, Font font, Color color)
        {
            base.Text = text;
            Font = font;
            ForeColor = color;
            BackColor = Color.Transparent;
            AutoSize = false;
            UseMnemonic = false;
        }
    }
}
