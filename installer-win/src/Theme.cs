// CoreAC Setup — colours, fonts and drawing helpers.
// C# 5 (the .NET Framework compiler that ships with Windows): no string
// interpolation, no ?. operator, no expression-bodied members.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace CoreAcSetup
{
    static class Theme
    {
        // Same palette as the web panel: near-black surfaces, off-white text,
        // colour only for status.
        public static readonly Color Bg = Color.FromArgb(9, 9, 10);
        public static readonly Color Rail = Color.FromArgb(13, 13, 15);
        public static readonly Color Card = Color.FromArgb(19, 19, 21);
        public static readonly Color CardHover = Color.FromArgb(25, 25, 28);
        public static readonly Color Input = Color.FromArgb(15, 15, 17);
        public static readonly Color Border = Color.FromArgb(40, 40, 45);
        public static readonly Color BorderHover = Color.FromArgb(64, 64, 70);
        public static readonly Color BorderFocus = Color.FromArgb(150, 150, 158);
        public static readonly Color Text = Color.FromArgb(236, 236, 239);
        public static readonly Color Muted = Color.FromArgb(150, 150, 158);
        public static readonly Color Dim = Color.FromArgb(100, 100, 108);
        public static readonly Color Faint = Color.FromArgb(58, 58, 64);
        public static readonly Color Green = Color.FromArgb(52, 211, 153);
        public static readonly Color Red = Color.FromArgb(248, 113, 113);
        public static readonly Color Amber = Color.FromArgb(251, 191, 36);
        public static readonly Color White = Color.FromArgb(250, 250, 250);
        public static readonly Color Black = Color.FromArgb(10, 10, 11);

        /// <summary>Screen DPI / 96. Every pixel size in the UI goes through S().</summary>
        public static float Scale = 1f;

        public static int S(float px)
        {
            return (int)Math.Round(px * Scale);
        }

        static string monoFamily;

        public static Font Ui(float size)
        {
            return new Font("Segoe UI", size, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static Font UiSemi(float size)
        {
            return new Font("Segoe UI Semibold", size, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static Font UiBold(float size)
        {
            return new Font("Segoe UI", size, FontStyle.Bold, GraphicsUnit.Point);
        }

        public static Font Mono(float size)
        {
            if (monoFamily == null)
            {
                monoFamily = "Consolas";
                using (var installed = new InstalledFontCollection())
                {
                    foreach (var f in installed.Families)
                    {
                        if (f.Name == "Cascadia Mono") { monoFamily = "Cascadia Mono"; break; }
                    }
                }
            }
            return new Font(monoFamily, size, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static void Hq(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        }

        public static GraphicsPath Round(RectangleF r, float radius)
        {
            var p = new GraphicsPath();
            float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
            if (d <= 0.5f)
            {
                p.AddRectangle(r);
                return p;
            }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static void FillRound(Graphics g, Color c, RectangleF r, float radius)
        {
            using (var b = new SolidBrush(c))
            using (var p = Round(r, radius))
                g.FillPath(b, p);
        }

        public static void StrokeRound(Graphics g, Color c, RectangleF r, float radius, float width)
        {
            using (var pen = new Pen(c, width))
            using (var p = Round(r, radius))
                g.DrawPath(pen, p);
        }

        /// <summary>The CoreAC mark: a faceted shield with a solid hex core (64-unit grid, as on the web).</summary>
        public static void DrawLogo(Graphics g, RectangleF box)
        {
            float k = Math.Min(box.Width, box.Height) / 64f;
            float ox = box.X + (box.Width - 64 * k) / 2f;
            float oy = box.Y + (box.Height - 64 * k) / 2f;
            Func<float, float, PointF> P = (x, y) => new PointF(ox + x * k, oy + y * k);

            using (var grad = new LinearGradientBrush(P(0, 0), P(64, 64), Color.White, Color.FromArgb(154, 154, 162)))
            {
                using (var shield = new GraphicsPath())
                {
                    shield.AddPolygon(new[] { P(32, 5), P(57, 14), P(57, 32.5f), P(32, 59), P(7, 32.5f), P(7, 14) });
                    using (var pen = new Pen(grad, 5 * k))
                    {
                        pen.LineJoin = LineJoin.Round;
                        g.DrawPath(pen, shield);
                    }
                }
                using (var core = new GraphicsPath())
                {
                    core.AddPolygon(new[] { P(32, 22), P(40, 26.6f), P(40, 35.8f), P(32, 40.4f), P(24, 35.8f), P(24, 26.6f) });
                    g.FillPath(grad, core);
                }
            }
        }

        public static void DrawCheck(Graphics g, Color c, RectangleF r, float width)
        {
            using (var pen = new Pen(c, width))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                g.DrawLines(pen, new[]
                {
                    new PointF(r.X + r.Width * 0.18f, r.Y + r.Height * 0.52f),
                    new PointF(r.X + r.Width * 0.42f, r.Y + r.Height * 0.74f),
                    new PointF(r.X + r.Width * 0.82f, r.Y + r.Height * 0.28f)
                });
            }
        }

        public static void DrawCross(Graphics g, Color c, RectangleF r, float width)
        {
            using (var pen = new Pen(c, width))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                g.DrawLine(pen, r.X + r.Width * 0.28f, r.Y + r.Height * 0.28f, r.X + r.Width * 0.72f, r.Y + r.Height * 0.72f);
                g.DrawLine(pen, r.X + r.Width * 0.72f, r.Y + r.Height * 0.28f, r.X + r.Width * 0.28f, r.Y + r.Height * 0.72f);
            }
        }

        public static Color Mix(Color a, Color b, float t)
        {
            t = Math.Max(0, Math.Min(1, t));
            return Color.FromArgb(
                (int)(a.A + (b.A - a.A) * t),
                (int)(a.R + (b.R - a.R) * t),
                (int)(a.G + (b.G - a.G) * t),
                (int)(a.B + (b.B - a.B) * t));
        }
    }
}
