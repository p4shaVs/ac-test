// Build helper: renders the CoreAC mark into a multi-size .ico (PNG frames).
// Usage: IconGen.exe out.ico
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

static class IconGen
{
    static int Main(string[] args)
    {
        if (args.Length < 1) { Console.Error.WriteLine("usage: IconGen out.ico"); return 1; }
        int[] sizes = { 256, 64, 48, 32, 24, 16 };
        var frames = new List<byte[]>();
        foreach (int s in sizes) frames.Add(Render(s));
        using (var fs = File.Create(args[0]))
        using (var w = new BinaryWriter(fs))
        {
            w.Write((short)0);
            w.Write((short)1);
            w.Write((short)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                int s = sizes[i];
                w.Write((byte)(s >= 256 ? 0 : s));
                w.Write((byte)(s >= 256 ? 0 : s));
                w.Write((byte)0);
                w.Write((byte)0);
                w.Write((short)1);
                w.Write((short)32);
                w.Write(frames[i].Length);
                w.Write(offset);
                offset += frames[i].Length;
            }
            foreach (var f in frames) w.Write(f);
        }
        return 0;
    }

    static GraphicsPath Round(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = radius * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static byte[] Render(int s)
    {
        using (var bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            // Dark rounded tile so the white mark reads on light desktops too.
            var tile = new RectangleF(0.5f, 0.5f, s - 1f, s - 1f);
            using (var path = Round(tile, s * 0.22f))
            {
                using (var b = new LinearGradientBrush(tile, Color.FromArgb(30, 30, 34), Color.FromArgb(10, 10, 11), 90f)) g.FillPath(b, path);
                using (var pen = new Pen(Color.FromArgb(64, 64, 70), Math.Max(1f, s / 96f))) g.DrawPath(pen, path);
            }
            float pad = s * (s <= 24 ? 0.12f : 0.17f);
            float k = (s - 2 * pad) / 64f;
            Func<float, float, PointF> P = (x, y) => new PointF(pad + x * k, pad + y * k);
            using (var grad = new LinearGradientBrush(P(0, 0), P(64, 64), Color.White, Color.FromArgb(154, 154, 162)))
            {
                using (var shield = new GraphicsPath())
                {
                    shield.AddPolygon(new[] { P(32, 5), P(57, 14), P(57, 32.5f), P(32, 59), P(7, 32.5f), P(7, 14) });
                    using (var pen = new Pen(grad, Math.Max(1.4f, (s <= 24 ? 7 : 5) * k)) { LineJoin = LineJoin.Round }) g.DrawPath(pen, shield);
                }
                using (var core = new GraphicsPath())
                {
                    core.AddPolygon(new[] { P(32, 22), P(40, 26.6f), P(40, 35.8f), P(32, 40.4f), P(24, 35.8f), P(24, 26.6f) });
                    g.FillPath(grad, core);
                }
            }
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                return ms.ToArray();
            }
        }
    }
}
