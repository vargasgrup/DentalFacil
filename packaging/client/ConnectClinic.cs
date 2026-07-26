// N&K DentalSoft Client connector — .NET Framework WinForms
// Discovers clinic Server on LAN (TCP 8001 + /api/system/health), then opens Edge --app.
// Compile: packaging/scripts/build_client_connector.ps1

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace NkDentalSoft.Client
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool forcePrompt = false;
            bool autoConnect = false;
            foreach (var a in args)
            {
                var s = (a ?? "").Trim().ToLowerInvariant();
                if (s == "--force-prompt" || s == "-forceprompt" || s == "/force") forcePrompt = true;
                if (s == "--auto-connect" || s == "-autoconnect" || s == "/auto") autoConnect = true;
            }

            try
            {
                Directory.CreateDirectory(Config.Dir);
                if (autoConnect && !forcePrompt)
                {
                    var saved = Config.LoadUrl();
                    if (!string.IsNullOrWhiteSpace(saved))
                    {
                        var hit = Discovery.ProbeUrl(saved, 1500);
                        if (hit != null)
                        {
                            Launcher.Open(hit.Url);
                            return;
                        }
                        Config.ClearUrl();
                    }
                }

                Application.Run(new ConnectForm(forcePrompt));
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                MessageBox.Show(
                    "No se pudo iniciar el conector:\n" + ex.Message +
                    "\n\nDetalle en:\n" + Logger.LogPath,
                    "N&K DentalSoft Client",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }

    internal static class Config
    {
        public static readonly string Dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NKDentalSoft");

        public static readonly string UrlFile = Path.Combine(Dir, "client-url.txt");

        public static string LoadUrl()
        {
            try
            {
                if (!File.Exists(UrlFile)) return "";
                return (File.ReadAllText(UrlFile) ?? "").Trim();
            }
            catch { return ""; }
        }

        public static void SaveUrl(string url)
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(UrlFile, (url ?? "").Trim().TrimEnd('/'), Encoding.ASCII);
        }

        public static void ClearUrl()
        {
            try { if (File.Exists(UrlFile)) File.Delete(UrlFile); } catch { }
        }
    }

    internal static class Logger
    {
        public static readonly string LogPath = Path.Combine(Config.Dir, "client.log");

        public static void Info(string msg)
        {
            try
            {
                Directory.CreateDirectory(Config.Dir);
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("s") + " INFO  " + msg + Environment.NewLine);
            }
            catch { }
        }

        public static void Error(Exception ex)
        {
            try
            {
                Directory.CreateDirectory(Config.Dir);
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("s") + " ERROR " + ex + Environment.NewLine);
            }
            catch { }
        }
    }

    internal sealed class ServerHit
    {
        public string Ip;
        public int Port;
        public string Url;
        public string Product;
        public string Version;
        public string Status;

        public override string ToString()
        {
            return Url + "  |  " + Product + " v" + Version + "  [" + Status + "]";
        }
    }

    internal static class Discovery
    {
        public const int DefaultPort = 8001;
        public const int UdpDiscoveryPort = 37020;

        public static ServerHit ProbeUrl(string url, int timeoutMs)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url)) return null;
                url = url.Trim();
                if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    url = "http://" + url;

                // bare IP -> :8001
                var m = Regex.Match(url, @"^https?://(\d+\.\d+\.\d+\.\d+)/?$", RegexOptions.IgnoreCase);
                if (m.Success) url = "http://" + m.Groups[1].Value + ":" + DefaultPort + "/";

                var u = new Uri(url);
                var host = u.Host;
                var port = u.IsDefaultPort ? DefaultPort : u.Port;
                return ProbeHost(host, port, timeoutMs);
            }
            catch (Exception ex)
            {
                Logger.Info("ProbeUrl failed: " + ex.Message);
                return null;
            }
        }

        public static ServerHit ProbeHost(string host, int port, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(host)) return null;
            if (!TcpOpen(host, port, timeoutMs)) return null;

            try
            {
                var health = "http://" + host + ":" + port + "/api/system/health";
                var req = (HttpWebRequest)WebRequest.Create(health);
                req.Method = "GET";
                req.Timeout = Math.Max(1200, timeoutMs);
                req.ReadWriteTimeout = Math.Max(1200, timeoutMs);
                req.Proxy = null;
                req.KeepAlive = false;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var stream = resp.GetResponseStream())
                using (var reader = new StreamReader(stream ?? Stream.Null, Encoding.UTF8))
                {
                    if ((int)resp.StatusCode != 200) return null;
                    var body = reader.ReadToEnd() ?? "";
                    // Accept any healthy N&K / FastAPI health shape (ok or degraded)
                    if (body.IndexOf("status", StringComparison.OrdinalIgnoreCase) < 0 &&
                        body.IndexOf("Dental", StringComparison.OrdinalIgnoreCase) < 0 &&
                        body.IndexOf("product", StringComparison.OrdinalIgnoreCase) < 0 &&
                        body.IndexOf("app", StringComparison.OrdinalIgnoreCase) < 0)
                        return null;

                    return new ServerHit
                    {
                        Ip = host,
                        Port = port,
                        Url = "http://" + host + ":" + port + "/",
                        Product = ExtractJsonString(body, "product") ??
                                  ExtractJsonString(body, "app") ?? "N&K DentalSoft",
                        Version = ExtractJsonString(body, "version") ?? "",
                        Status = ExtractJsonString(body, "status") ?? "ok"
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Info("HTTP probe " + host + ":" + port + " -> " + ex.Message);
                return null;
            }
        }

        private static bool TcpOpen(string host, int port, int timeoutMs)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var ar = client.BeginConnect(host, port, null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(timeoutMs, false))
                    {
                        try { client.Close(); } catch { }
                        return false;
                    }
                    client.EndConnect(ar);
                    return true;
                }
            }
            catch { return false; }
        }

        private static string ExtractJsonString(string json, string key)
        {
            var m = Regex.Match(json ?? "",
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"([^\"]*)\"",
                RegexOptions.IgnoreCase);
            return m.Success ? m.Groups[1].Value : null;
        }

        public static List<string> LanPrefixes()
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    var props = ni.GetIPProperties();
                    foreach (var ua in props.UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                        var ip = ua.Address.ToString();
                        if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;
                        // Skip Hyper-V / WSL / VPN-ish ranges for primary scan order
                        if (ip.StartsWith("172.1") || ip.StartsWith("172.2") || ip.StartsWith("10.2.")) continue;
                        var parts = ip.Split('.');
                        if (parts.Length != 4) continue;
                        set.Add(parts[0] + "." + parts[1] + "." + parts[2]);
                    }
                }
            }
            catch (Exception ex) { Logger.Info("LanPrefixes: " + ex.Message); }

            // Always include common clinic home-router ranges
            foreach (var p in new[] { "192.168.0", "192.168.1", "192.168.100", "10.0.0" })
                set.Add(p);

            return new List<string>(set);
        }

        public static List<string> MdnsCandidates()
        {
            var names = new[]
            {
                "nkdentalsoft-server.local",
                "nkdentalsoft.local",
                "nk-dentalsoft.local"
            };
            var ips = new List<string>();
            foreach (var name in names)
            {
                try
                {
                    var addrs = Dns.GetHostAddresses(name);
                    foreach (var a in addrs)
                    {
                        if (a.AddressFamily != AddressFamily.InterNetwork) continue;
                        var s = a.ToString();
                        if (!ips.Contains(s)) ips.Add(s);
                    }
                }
                catch { }
            }
            return ips;
        }

        /// <summary>UDP broadcast discovery (Server lan_discovery.py on port 37020).</summary>
        public static List<ServerHit> UdpDiscover(Action<string> status, CancellationToken ct, int waitMs = 2500)
        {
            var hits = new List<ServerHit>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            status("Anuncio UDP en la red (puerto 37020)...");

            try
            {
                using (var udp = new UdpClient())
                {
                    udp.EnableBroadcast = true;
                    udp.Client.ReceiveTimeout = 400;
                    try { udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true); } catch { }

                    var probe = Encoding.ASCII.GetBytes("NKDS_DISCOVER");
                    var targets = new List<IPEndPoint>
                    {
                        new IPEndPoint(IPAddress.Broadcast, UdpDiscoveryPort)
                    };
                    foreach (var prefix in LanPrefixes())
                    {
                        try
                        {
                            targets.Add(new IPEndPoint(IPAddress.Parse(prefix + ".255"), UdpDiscoveryPort));
                        }
                        catch { }
                    }

                    foreach (var t in targets)
                    {
                        if (ct.IsCancellationRequested) break;
                        try { udp.Send(probe, probe.Length, t); } catch { }
                    }

                    var deadline = DateTime.UtcNow.AddMilliseconds(waitMs);
                    while (DateTime.UtcNow < deadline && !ct.IsCancellationRequested)
                    {
                        try
                        {
                            var remote = new IPEndPoint(IPAddress.Any, 0);
                            var data = udp.Receive(ref remote);
                            var text = Encoding.UTF8.GetString(data ?? new byte[0]);
                            if (text.IndexOf("NKDS1", StringComparison.OrdinalIgnoreCase) < 0 &&
                                text.IndexOf("Dental", StringComparison.OrdinalIgnoreCase) < 0)
                                continue;

                            var port = DefaultPort;
                            var portMatch = Regex.Match(text, "\"port\"\\s*:\\s*(\\d+)");
                            if (portMatch.Success) int.TryParse(portMatch.Groups[1].Value, out port);

                            var ips = new List<string>();
                            foreach (Match m in Regex.Matches(text, "\"(\\d+\\.\\d+\\.\\d+\\.\\d+)\""))
                            {
                                var ip = m.Groups[1].Value;
                                if (!ips.Contains(ip)) ips.Add(ip);
                            }
                            if (ips.Count == 0 && remote.Address != null)
                                ips.Add(remote.Address.ToString());

                            foreach (var ip in ips)
                            {
                                if (ct.IsCancellationRequested) break;
                                status("UDP encontro " + ip + " — verificando...");
                                var hit = ProbeHost(ip, port, 1200);
                                if (hit != null && seen.Add(hit.Url))
                                    hits.Add(hit);
                            }
                        }
                        catch (SocketException)
                        {
                            // receive timeout — keep waiting until deadline
                        }
                        catch (Exception ex)
                        {
                            Logger.Info("UDP discover: " + ex.Message);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Info("UDP discover failed: " + ex.Message);
            }

            return hits;
        }

        public static List<ServerHit> FindServers(Action<string> status, CancellationToken ct)
        {
            var found = new List<ServerHit>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void Add(ServerHit h)
            {
                if (h == null) return;
                if (!seen.Add(h.Url)) return;
                found.Add(h);
            }

            status("Comprobando este equipo (localhost:8001)...");
            Add(ProbeHost("127.0.0.1", DefaultPort, 700));
            if (ct.IsCancellationRequested) return found;

            // Fast path: UDP beacon / probe (works even when TCP scan is slow)
            foreach (var h in UdpDiscover(status, ct, 2800))
                Add(h);
            if (found.Count > 0) return found;

            status("Buscando por nombre de red (mDNS)...");
            foreach (var ip in MdnsCandidates())
            {
                if (ct.IsCancellationRequested) break;
                Add(ProbeHost(ip, DefaultPort, 900));
            }
            if (found.Count > 0) return found;

            foreach (var prefix in LanPrefixes())
            {
                if (ct.IsCancellationRequested) break;
                status("Explorando red " + prefix + ".* (puerto 8001)...");
                var open = ScanPrefix(prefix, DefaultPort, 320, ct);
                foreach (var ip in open)
                {
                    if (ct.IsCancellationRequested) break;
                    status("Verificando " + ip + "...");
                    Add(ProbeHost(ip, DefaultPort, 900));
                }
                if (found.Count > 0) break;
            }

            return found;
        }

        private static List<string> ScanPrefix(string prefix, int port, int timeoutMs, CancellationToken ct)
        {
            var bag = new System.Collections.Concurrent.ConcurrentBag<string>();
            Parallel.For(1, 255, new ParallelOptions
            {
                MaxDegreeOfParallelism = 64,
                CancellationToken = CancellationToken.None
            }, i =>
            {
                if (ct.IsCancellationRequested) return;
                var ip = prefix + "." + i;
                if (TcpOpen(ip, port, timeoutMs)) bag.Add(ip);
            });
            var open = new List<string>(bag);
            open.Sort(CompareIp);
            return open;
        }

        private static int CompareIp(string a, string b)
        {
            try
            {
                var pa = Array.ConvertAll(a.Split('.'), int.Parse);
                var pb = Array.ConvertAll(b.Split('.'), int.Parse);
                for (int i = 0; i < 4; i++)
                {
                    var c = pa[i].CompareTo(pb[i]);
                    if (c != 0) return c;
                }
            }
            catch { }
            return string.CompareOrdinal(a, b);
        }
    }

    internal static class Launcher
    {
        public static void Open(string url)
        {
            url = (url ?? "").Trim().TrimEnd('/');
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                url = "http://" + url;

            Config.SaveUrl(url);
            Logger.Info("Opening " + url);

            var edge = FindEdge();
            if (!string.IsNullOrEmpty(edge))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = edge,
                    Arguments = "--app=\"" + url + "\" --new-window",
                    UseShellExecute = false
                });
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }

        private static string FindEdge()
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Microsoft", "Edge", "Application", "msedge.exe")
            };
            foreach (var c in candidates)
                if (File.Exists(c)) return c;
            return null;
        }
    }

    internal sealed class ConnectForm : Form
    {
        private readonly ListBox _list;
        private readonly TextBox _manual;
        private readonly Label _status;
        private readonly Button _btnSearch;
        private readonly Button _btnConnect;
        private readonly List<ServerHit> _hits = new List<ServerHit>();
        private CancellationTokenSource _cts;

        public ConnectForm(bool forcePrompt)
        {
            Text = "N&K DentalSoft Client";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(560, 470);
            BackColor = Color.FromArgb(248, 250, 252);
            Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            var title = new Label
            {
                Text = "Conectar al servidor de la clinica",
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(18, 14)
            };
            Controls.Add(title);

            var sub = new Label
            {
                Text = "Busca automaticamente el PC servidor (UDP + puerto TCP 8001).",
                ForeColor = Color.FromArgb(100, 116, 139),
                AutoSize = false,
                Size = new Size(520, 20),
                Location = new Point(20, 44)
            };
            Controls.Add(sub);

            _status = new Label
            {
                Text = "Listo.",
                ForeColor = Color.FromArgb(30, 136, 229),
                AutoSize = false,
                Size = new Size(520, 36),
                Location = new Point(20, 68)
            };
            Controls.Add(_status);

            _list = new ListBox
            {
                Location = new Point(22, 108),
                Size = new Size(516, 150),
                IntegralHeight = false
            };
            _list.SelectedIndexChanged += (s, e) =>
            {
                if (_list.SelectedIndex >= 0 && _list.SelectedIndex < _hits.Count)
                    _manual.Text = _hits[_list.SelectedIndex].Url;
            };
            Controls.Add(_list);

            var manualLbl = new Label
            {
                Text = "O escriba la IP del PC servidor (ej. 192.168.1.10):",
                AutoSize = true,
                Location = new Point(20, 268)
            };
            Controls.Add(manualLbl);

            _manual = new TextBox
            {
                Location = new Point(22, 290),
                Size = new Size(516, 26),
                Text = forcePrompt ? "" : Config.LoadUrl()
            };
            Controls.Add(_manual);

            var help = new Label
            {
                Text = "Si no aparece: 1) Encienda N&K DentalSoft en el PC servidor  2) Misma Wi-Fi/LAN (no invitado)  3) En el servidor, Configuracion > Equipos conectados muestra la IP.",
                ForeColor = Color.FromArgb(100, 116, 139),
                AutoSize = false,
                Size = new Size(516, 40),
                Location = new Point(22, 322)
            };
            Controls.Add(help);

            _btnSearch = new Button
            {
                Text = "Buscar en la red",
                Location = new Point(22, 372),
                Size = new Size(140, 34)
            };
            _btnSearch.Click += async (s, e) => await SearchAsync();
            Controls.Add(_btnSearch);

            _btnConnect = new Button
            {
                Text = "Conectar",
                Location = new Point(300, 372),
                Size = new Size(120, 34),
                BackColor = Color.FromArgb(30, 136, 229),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnConnect.Click += (s, e) => Connect();
            Controls.Add(_btnConnect);

            var btnCancel = new Button
            {
                Text = "Cancelar",
                Location = new Point(430, 372),
                Size = new Size(108, 34)
            };
            btnCancel.Click += (s, e) => Close();
            Controls.Add(btnCancel);

            AcceptButton = _btnConnect;
            CancelButton = btnCancel;

            Shown += async (s, e) => await SearchAsync();
        }

        private async Task SearchAsync()
        {
            try
            {
                _cts?.Cancel();
                _cts = new CancellationTokenSource();
                var token = _cts.Token;

                _btnSearch.Enabled = false;
                _btnConnect.Enabled = false;
                Cursor = Cursors.WaitCursor;
                _list.Items.Clear();
                _hits.Clear();
                _status.Text = "Buscando servidores N&K DentalSoft...";

                List<ServerHit> hits = null;
                await Task.Run(() =>
                {
                    hits = Discovery.FindServers(msg =>
                    {
                        try
                        {
                            BeginInvoke(new Action(() => { _status.Text = msg; }));
                        }
                        catch { }
                    }, token);
                }, token);

                if (IsDisposed) return;
                _hits.AddRange(hits ?? new List<ServerHit>());
                foreach (var h in _hits) _list.Items.Add(h.ToString());

                if (_hits.Count == 0)
                {
                    _status.Text = "No se encontro ningun servidor. Escriba la IP del PC servidor abajo (ej. 192.168.1.10) o pulse Buscar de nuevo con el Server encendido.";
                    if (string.IsNullOrWhiteSpace(_manual.Text))
                        _manual.Text = "192.168.";
                    _manual.Focus();
                    _manual.SelectionStart = _manual.Text.Length;
                }
                else
                {
                    _status.Text = "Se encontraron " + _hits.Count + " servidor(es). Seleccione uno y pulse Conectar.";
                    _list.SelectedIndex = 0;
                    _manual.Text = _hits[0].Url;
                }
            }
            catch (OperationCanceledException)
            {
                _status.Text = "Busqueda cancelada.";
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                _status.Text = "Error al buscar: " + ex.Message;
            }
            finally
            {
                if (!IsDisposed)
                {
                    _btnSearch.Enabled = true;
                    _btnConnect.Enabled = true;
                    Cursor = Cursors.Default;
                }
            }
        }

        private void Connect()
        {
            var url = (_manual.Text ?? "").Trim();
            if (string.IsNullOrEmpty(url))
            {
                MessageBox.Show(
                    "Seleccione un servidor de la lista o escriba la URL/IP.",
                    "N&K DentalSoft",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            _status.Text = "Comprobando " + url + "...";
            Application.DoEvents();

            var hit = Discovery.ProbeUrl(url, 2000);
            if (hit == null)
            {
                MessageBox.Show(
                    "No hay respuesta de N&K DentalSoft en:\n" + url +
                    "\n\nRevise que el Server este encendido y el firewall permita el puerto 8001.",
                    "No se pudo conectar",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            Launcher.Open(hit.Url);
            Close();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try { _cts?.Cancel(); } catch { }
            base.OnFormClosed(e);
        }
    }
}
