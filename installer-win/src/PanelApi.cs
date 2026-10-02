// CoreAC Setup — talks to the CoreAC panel (/api/v1/install/*).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace CoreAcSetup
{
    class PanelException : Exception
    {
        public readonly int Status;
        public readonly string Code;

        public PanelException(string message, int status, string code) : base(message)
        {
            Status = status;
            Code = code;
        }
    }

    class ServerInfo
    {
        public string Id;
        public string Name;
        public bool Online;
        public string InstalledVersion;
        public string LastSeenAt;
    }

    class KeyInfo
    {
        public string Product;
        public string ExpiresAt;
        public List<ServerInfo> Servers = new List<ServerInfo>();
    }

    class ClaimInfo
    {
        public string ServerId;
        public string ServerName;
        public string Token;
        public string ApiUrl;
    }

    class PanelApi : IDisposable
    {
        public readonly string Base;
        readonly HttpClient http;
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };

        public PanelApi(string baseUrl)
        {
            Base = (baseUrl ?? "").Trim().TrimEnd('/');
            http = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("CoreAC-Setup/" + Program.Version);
        }

        public void Dispose()
        {
            http.Dispose();
        }

        static string Str(IDictionary d, string k)
        {
            object v = d.Contains(k) ? d[k] : null;
            return v == null ? null : Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture);
        }

        static bool Bool(IDictionary d, string k)
        {
            object v = d.Contains(k) ? d[k] : null;
            return v is bool && (bool)v;
        }

        /// <summary>POSTs JSON and returns the "data" object, or throws a PanelException with the panel's message.</summary>
        async Task<IDictionary> Post(string path, object body, CancellationToken ct)
        {
            HttpResponseMessage res;
            try
            {
                var content = new StringContent(Json.Serialize(body), Encoding.UTF8, "application/json");
                res = await http.PostAsync(Base + path, content, ct).ConfigureAwait(false);
            }
            catch (TaskCanceledException)
            {
                if (ct.IsCancellationRequested) throw;
                throw new PanelException("The panel did not answer in time (" + Base + ").", 0, "TIMEOUT");
            }
            catch (HttpRequestException ex)
            {
                throw new PanelException("Could not reach the panel at " + Base + ". " + Inner(ex), 0, "NETWORK");
            }
            using (res)
            {
                string text = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                return Unwrap(res, text);
            }
        }

        static string Inner(Exception ex)
        {
            while (ex.InnerException != null) ex = ex.InnerException;
            return ex.Message;
        }

        static IDictionary Unwrap(HttpResponseMessage res, string text)
        {
            IDictionary obj = null;
            try { obj = Json.DeserializeObject(text) as IDictionary; }
            catch (ArgumentException) { }
            if (obj == null)
                throw new PanelException("The panel answered with something unexpected (HTTP " + (int)res.StatusCode + "). Is the address right?", (int)res.StatusCode, "BAD_RESPONSE");
            if (!res.IsSuccessStatusCode || !Bool(obj, "ok"))
            {
                string msg = Str(obj, "error");
                if (string.IsNullOrEmpty(msg)) msg = "The panel refused the request (HTTP " + (int)res.StatusCode + ").";
                throw new PanelException(msg, (int)res.StatusCode, Str(obj, "code") ?? "");
            }
            return obj["data"] as IDictionary ?? new Dictionary<string, object>();
        }

        public async Task<KeyInfo> CheckKey(string key, CancellationToken ct)
        {
            var data = await Post("/api/v1/install/key", new Dictionary<string, object> { { "key", key } }, ct).ConfigureAwait(false);
            var info = new KeyInfo { Product = Str(data, "product"), ExpiresAt = Str(data, "expiresAt") };
            var list = data.Contains("servers") ? data["servers"] as IEnumerable : null;
            if (list != null)
            {
                foreach (var o in list)
                {
                    var s = o as IDictionary;
                    if (s == null) continue;
                    info.Servers.Add(new ServerInfo
                    {
                        Id = Str(s, "id"),
                        Name = Str(s, "name"),
                        Online = Bool(s, "online"),
                        InstalledVersion = Str(s, "installedVersion"),
                        LastSeenAt = Str(s, "lastSeenAt")
                    });
                }
            }
            return info;
        }

        public async Task<ClaimInfo> Claim(string key, string serverId, CancellationToken ct)
        {
            var data = await Post("/api/v1/install/claim", new Dictionary<string, object> { { "key", key }, { "serverId", serverId } }, ct).ConfigureAwait(false);
            var c = new ClaimInfo { ServerId = Str(data, "serverId"), ServerName = Str(data, "serverName"), Token = Str(data, "token"), ApiUrl = Str(data, "apiUrl") };
            if (string.IsNullOrEmpty(c.Token) || string.IsNullOrEmpty(c.ApiUrl))
                throw new PanelException("The panel did not return a server token.", 0, "BAD_RESPONSE");
            return c;
        }

        /// <summary>Downloads the protected resource zip with the licence key. progress(received, total) — total is -1 when unknown.</summary>
        public async Task DownloadResource(string key, string serverId, string destFile, Action<long, long> progress, CancellationToken ct)
        {
            var req = new HttpRequestMessage(HttpMethod.Get, Base + "/api/v1/install/resource");
            req.Headers.Add("X-CoreAC-Key", key);
            req.Headers.Add("X-CoreAC-Server", serverId);
            HttpResponseMessage res;
            try
            {
                res = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                throw new PanelException("Could not reach the panel at " + Base + ". " + Inner(ex), 0, "NETWORK");
            }
            using (res)
            {
                string type = res.Content.Headers.ContentType != null ? res.Content.Headers.ContentType.MediaType : "";
                if (!res.IsSuccessStatusCode || type != "application/zip")
                {
                    string text = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                    Unwrap(res, text); // throws with the panel's message
                    throw new PanelException("The panel did not send the resource package.", (int)res.StatusCode, "BAD_RESPONSE");
                }
                long total = res.Content.Headers.ContentLength.HasValue ? res.Content.Headers.ContentLength.Value : -1;
                using (var input = await res.Content.ReadAsStreamAsync().ConfigureAwait(false))
                using (var output = new FileStream(destFile, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
                {
                    var buf = new byte[81920];
                    long got = 0;
                    int n;
                    while ((n = await input.ReadAsync(buf, 0, buf.Length, ct).ConfigureAwait(false)) > 0)
                    {
                        await output.WriteAsync(buf, 0, n, ct).ConfigureAwait(false);
                        got += n;
                        if (progress != null) progress(got, total);
                    }
                }
            }
        }

        public static void EnableModernTls()
        {
            // .NET 4.5/4.6 default to TLS 1.0 — panels behind Cloudflare/nginx refuse that.
            try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072 | (SecurityProtocolType)12288; }
            catch (NotSupportedException) { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; }
        }
    }
}
