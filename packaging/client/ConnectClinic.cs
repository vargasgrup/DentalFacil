// N&K DentalSoft Client — native LAN connector (.NET Framework WinForms)
// Discovers Server via UDP 37020, ARP neighbors, TCP :8001 health, clipboard URL.
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
            string importPath = null;
            foreach (var a in args)
            {
                var s = (a ?? "").Trim();
                var low = s.ToLowerInvariant();
                if (low == "--force-prompt" || low == "-forceprompt" || low == "/force") forcePrompt = true;
                else if (low == "--auto-connect" || low == "-autoconnect" || low == "/auto") autoConnect = true;
                else if (low == "--repair-lan" || low == "/repair")
                {
                    LanRepair.RunElevated();
                    return;
                }
                else if (File.Exists(s) && (s.EndsWith(".url", StringComparison.OrdinalIgnoreCase)
                    || s.EndsWith(".nkds", StringComparison.OrdinalIgnoreCase)
                    || s.EndsWith(".txt", StringComparison.OrdinalIgnoreCase)))
                {
                    importPath = s;
                }
            }

            try
            {
                Directory.CreateDirectory(Config.Dir);

                if (!string.IsNullOrEmpty(importPath))
                {
                    var fromFile = UrlImport.FromFile(importPath);
                    if (!string.IsNullOrEmpty(fromFile))
                    {
                        var hit = Discovery.ProbeUrl(fromFile, 2500);
                        if (hit != null)
                        {
                            Launcher.Open(hit.Url);
                            return;
                        }
                        Config.SaveUrl(fromFile);
                        forcePrompt = true;
                    }
                }

                if (autoConnect && !forcePrompt)
                {
                    var saved = Config.LoadUrl();
                    if (!string.IsNullOrWhiteSpace(saved))
                    {
                        var preferred = UrlImport.PreferNumericIpUrl(saved) ?? UrlImport.Normalize(saved);
                        // Drop legacy hostname bookmarks (DESKTOP-…) that break on other PCs
                        if (string.IsNullOrEmpty(preferred) ||
                            !Regex.IsMatch(preferred, @"https?://\d+\.\d+\.\d+\.\d+", RegexOptions.IgnoreCase))
                        {
                            Logger.Info("Clearing non-IP saved URL: " + saved);
                            Config.ClearUrl();
                        }
                        else
                        {
                            var hit = Discovery.ProbeUrl(preferred, 2000);
                            if (hit != null)
                            {
                                Launcher.Open(hit.Url);
                                return;
                            }
                            Config.ClearUrl();
                        }
                    }
                    // Clipboard may already have the Server "Copiar" URL
                    var clip = UrlImport.FromClipboard();
                    if (!string.IsNullOrEmpty(clip) &&
                        Regex.IsMatch(clip, @"https?://\d+\.\d+\.\d+\.\d+", RegexOptions.IgnoreCase))
                    {
                        var hit = Discovery.ProbeUrl(clip, 2000);
                        if (hit != null)
                        {
                            Launcher.Open(hit.Url);
                            return;
                        }
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

    internal static class UrlImport
    {
        public static string Normalize(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;
            raw = raw.Trim().Trim('"');
            var mUrl = Regex.Match(raw, @"https?://[^\s<>""']+", RegexOptions.IgnoreCase);
            if (mUrl.Success) return PreferNumericIpUrl(mUrl.Value.TrimEnd('/'));
            var mIp = Regex.Match(raw, @"\b(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?\b");
            if (mIp.Success)
            {
                var port = mIp.Groups[2].Success ? mIp.Groups[2].Value : "8001";
                return "http://" + mIp.Groups[1].Value + ":" + port;
            }
            // Reject bare hostnames like DESKTOP-XXXX — they break on clinic LAN
            if (Regex.IsMatch(raw, @"^[A-Za-z][A-Za-z0-9\-.]{0,62}$") &&
                raw.IndexOf('.') < 0)
            {
                var resolved = PreferNumericIpUrl("http://" + raw + ":8001/");
                return resolved;
            }
            return null;
        }

        /// <summary>
        /// Clinic LAN clients must use IPv4 literals. NetBIOS names (DESKTOP-…)
        /// almost never resolve on other Windows PCs.
        /// </summary>
        public static string PreferNumericIpUrl(string url)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url)) return null;
                if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    url = "http://" + url;
                var u = new Uri(url);
                var port = u.IsDefaultPort ? 8001 : u.Port;
                if (Regex.IsMatch(u.Host, @"^\d+\.\d+\.\d+\.\d+$"))
                    return "http://" + u.Host + ":" + port + "/";

                // Hostname → try DNS/LLMNR to IPv4, skip loopback
                foreach (var a in Dns.GetHostAddresses(u.Host))
                {
                    if (a.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = a.ToString();
                    if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;
                    Logger.Info("Resolved " + u.Host + " → " + ip);
                    return "http://" + ip + ":" + port + "/";
                }
            }
            catch (Exception ex)
            {
                Logger.Info("PreferNumericIpUrl: " + ex.Message);
            }
            return null;
        }

        public static string FromClipboard()
        {
            try
            {
                if (!Clipboard.ContainsText()) return null;
                return Normalize(Clipboard.GetText());
            }
            catch { return null; }
        }

        public static string FromFile(string path)
        {
            try
            {
                var text = File.ReadAllText(path);
                var m = Regex.Match(text, @"^\s*URL\s*=\s*(.+)\s*$", RegexOptions.IgnoreCase | RegexOptions.Multiline);
                if (m.Success) return Normalize(m.Groups[1].Value);
                return Normalize(text);
            }
            catch { return null; }
        }
    }

    internal static class LanRepair
    {
        public static string DetectVpnWarning()
        {
            try
            {
                var names = new List<string>();
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    var n = (ni.Name + " " + ni.Description);
                    if (Regex.IsMatch(n, "TUN|TAP|VPN|ProTUN|WireGuard|OpenVPN|Nord|ZeroTier|Hamachi", RegexOptions.IgnoreCase))
                        names.Add(ni.Name);
                }
                if (names.Count == 0) return null;
                return "VPN detectada (" + string.Join(", ", names.ToArray()) +
                       "). Las VPN suelen bloquear la red local. Desactívela y pulse Buscar.";
            }
            catch { return null; }
        }

        public static string DetectPublicNetworkWarning()
        {
            // Best-effort via netsh (no admin required to read)
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"(Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -notmatch 'TUN|TAP|VPN|vEthernet|ProTUN' -and $_.NetworkCategory -eq 'Public' } | Select-Object -ExpandProperty InterfaceAlias) -join ', '\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                using (var p = Process.Start(psi))
                {
                    var output = (p.StandardOutput.ReadToEnd() ?? "").Trim();
                    p.WaitForExit(4000);
                    if (!string.IsNullOrEmpty(output))
                        return "Red en perfil Publico (" + output + "). En Windows: Configuracion > Red > Propiedades > Perfil Privado. O pulse Reparar red.";
                }
            }
            catch { }
            return null;
        }

        public static void RunElevated()
        {
            var script = FindRepairScript();
            if (string.IsNullOrEmpty(script))
            {
                MessageBox.Show(
                    "No se encontro repair_lan.ps1. Reinstale el Client o ejecute en el Server el instalador actualizado.",
                    "Reparar red",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"",
                    UseShellExecute = true,
                    Verb = "runas"
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo elevar UAC:\n" + ex.Message, "Reparar red",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private static string FindRepairScript()
        {
            var candidates = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "repair_lan.ps1"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "NKDentalSoft", "Client", "repair_lan.ps1"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "NKDentalSoft", "Server", "scripts", "repair_lan.ps1")
            };
            foreach (var c in candidates)
                if (File.Exists(c)) return c;
            return null;
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
                // Force IP-literal URLs — hostname DESKTOP-… breaks across clinic PCs
                var preferred = UrlImport.PreferNumericIpUrl(url) ?? UrlImport.Normalize(url);
                if (string.IsNullOrEmpty(preferred))
                {
                    Logger.Info("ProbeUrl rejected non-IP URL: " + url);
                    return null;
                }
                url = preferred;

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
            string tcpErr;
            if (!TcpOpen(host, port, timeoutMs, out tcpErr))
            {
                if (!string.IsNullOrEmpty(tcpErr))
                    Logger.Info("TCP " + host + ":" + port + " -> " + tcpErr);
                return null;
            }

            try
            {
                var health = "http://" + host + ":" + port + "/api/system/health";
                var req = (HttpWebRequest)WebRequest.Create(health);
                req.Method = "GET";
                req.Timeout = Math.Max(1500, timeoutMs);
                req.ReadWriteTimeout = Math.Max(1500, timeoutMs);
                req.Proxy = null;
                req.KeepAlive = false;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var stream = resp.GetResponseStream())
                using (var reader = new StreamReader(stream ?? Stream.Null, Encoding.UTF8))
                {
                    if ((int)resp.StatusCode != 200) return null;
                    var body = reader.ReadToEnd() ?? "";
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

        private static bool TcpOpen(string host, int port, int timeoutMs, out string error)
        {
            error = null;
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
            catch (Exception ex)
            {
                error = ex.Message;
                // WSAEACCES often means Public profile / VPN / firewall policy
                return false;
            }
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
                    var desc = ni.Name + " " + ni.Description;
                    if (Regex.IsMatch(desc, "TUN|TAP|VPN|ProTUN|vEthernet|WireGuard", RegexOptions.IgnoreCase))
                        continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                        var ip = ua.Address.ToString();
                        if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;
                        var parts = ip.Split('.');
                        if (parts.Length != 4) continue;
                        set.Add(parts[0] + "." + parts[1] + "." + parts[2]);
                    }
                }
            }
            catch (Exception ex) { Logger.Info("LanPrefixes: " + ex.Message); }

            foreach (var p in new[] { "192.168.0", "192.168.1", "192.168.100", "10.0.0" })
                set.Add(p);
            return new List<string>(set);
        }

        public static List<string> ArpNeighbors()
        {
            var ips = new List<string>();
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "arp.exe",
                    Arguments = "-a",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };
                using (var p = Process.Start(psi))
                {
                    var output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    foreach (Match m in Regex.Matches(output ?? "", @"\b(\d+\.\d+\.\d+\.\d+)\b"))
                    {
                        var ip = m.Groups[1].Value;
                        if (ip.StartsWith("224.") || ip.StartsWith("255.") || ip.EndsWith(".255") || ip.StartsWith("127."))
                            continue;
                        if (!ips.Contains(ip)) ips.Add(ip);
                    }
                }
            }
            catch (Exception ex) { Logger.Info("ARP: " + ex.Message); }
            return ips;
        }

        public static List<ServerHit> UdpDiscover(Action<string> status, CancellationToken ct, int waitMs = 3000)
        {
            var hits = new List<ServerHit>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            status("Anuncio UDP (puerto 37020)...");
            try
            {
                using (var udp = new UdpClient())
                {
                    udp.EnableBroadcast = true;
                    udp.Client.ReceiveTimeout = 400;
                    var probe = Encoding.ASCII.GetBytes("NKDS_DISCOVER");
                    var targets = new List<IPEndPoint> { new IPEndPoint(IPAddress.Broadcast, UdpDiscoveryPort) };
                    foreach (var prefix in LanPrefixes())
                    {
                        try { targets.Add(new IPEndPoint(IPAddress.Parse(prefix + ".255"), UdpDiscoveryPort)); }
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

                            var candidates = new List<string>();
                            foreach (Match m in Regex.Matches(text, "\"(\\d+\\.\\d+\\.\\d+\\.\\d+)\""))
                            {
                                var ip = m.Groups[1].Value;
                                if (!candidates.Contains(ip)) candidates.Add(ip);
                            }
                            // Do NOT probe Windows computer names (DESKTOP-…) — they fail on other PCs.
                            if (candidates.Count == 0 && remote.Address != null)
                                candidates.Add(remote.Address.ToString());

                            foreach (var host in candidates)
                            {
                                if (!Regex.IsMatch(host, @"^\d+\.\d+\.\d+\.\d+$")) continue;
                                status("UDP -> verificando " + host + "...");
                                var hit = ProbeHost(host, port, 1500);
                                if (hit != null && seen.Add(hit.Url)) hits.Add(hit);
                            }
                        }
                        catch (SocketException) { }
                        catch (Exception ex) { Logger.Info("UDP: " + ex.Message); }
                    }
                }
            }
            catch (Exception ex) { Logger.Info("UDP failed: " + ex.Message); }
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

            status("Comprobando localhost:8001...");
            Add(ProbeHost("127.0.0.1", DefaultPort, 800));
            if (found.Count > 0) return found;

            foreach (var h in UdpDiscover(status, ct, 3000))
                Add(h);
            if (found.Count > 0) return found;

            status("Revisando vecinos ARP (equipos activos)...");
            foreach (var ip in ArpNeighbors())
            {
                if (ct.IsCancellationRequested) break;
                Add(ProbeHost(ip, DefaultPort, 500));
            }
            if (found.Count > 0) return found;

            foreach (var prefix in LanPrefixes())
            {
                if (ct.IsCancellationRequested) break;
                status("Explorando " + prefix + ".* :8001 ...");
                var open = ScanPrefix(prefix, DefaultPort, 350, ct);
                foreach (var ip in open)
                {
                    if (ct.IsCancellationRequested) break;
                    status("Verificando " + ip + "...");
                    Add(ProbeHost(ip, DefaultPort, 1000));
                }
                if (found.Count > 0) break;
            }
            return found;
        }

        private static List<string> ScanPrefix(string prefix, int port, int timeoutMs, CancellationToken ct)
        {
            var bag = new System.Collections.Concurrent.ConcurrentBag<string>();
            Parallel.For(1, 255, new ParallelOptions { MaxDegreeOfParallelism = 64 }, i =>
            {
                if (ct.IsCancellationRequested) return;
                string err;
                if (TcpOpen(prefix + "." + i, port, timeoutMs, out err))
                    bag.Add(prefix + "." + i);
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
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
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
        private readonly Label _warn;
        private readonly Button _btnSearch;
        private readonly Button _btnConnect;
        private readonly Button _btnPaste;
        private readonly List<ServerHit> _hits = new List<ServerHit>();
        private CancellationTokenSource _cts;

        public ConnectForm(bool forcePrompt)
        {
            Text = "N&K DentalSoft Client";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(580, 520);
            BackColor = Color.FromArgb(248, 250, 252);
            Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            Controls.Add(new Label
            {
                Text = "Conectar al servidor de la clinica",
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                AutoSize = true,
                Location = new Point(18, 12)
            });

            Controls.Add(new Label
            {
                Text = "Descubrimiento nativo: UDP + ARP + TCP 8001. Use la URL Copiar del Server si hace falta.",
                ForeColor = Color.FromArgb(100, 116, 139),
                Size = new Size(540, 18),
                Location = new Point(20, 42)
            });

            _warn = new Label
            {
                ForeColor = Color.FromArgb(180, 83, 9),
                Size = new Size(540, 36),
                Location = new Point(20, 64),
                Text = ""
            };
            Controls.Add(_warn);

            _status = new Label
            {
                Text = "Listo.",
                ForeColor = Color.FromArgb(30, 136, 229),
                Size = new Size(540, 36),
                Location = new Point(20, 100)
            };
            Controls.Add(_status);

            _list = new ListBox
            {
                Location = new Point(22, 140),
                Size = new Size(536, 140),
                IntegralHeight = false
            };
            _list.SelectedIndexChanged += (s, e) =>
            {
                if (_list.SelectedIndex >= 0 && _list.SelectedIndex < _hits.Count)
                    _manual.Text = _hits[_list.SelectedIndex].Url;
            };
            Controls.Add(_list);

            Controls.Add(new Label
            {
                Text = "IP o URL del servidor (ej. 192.168.100.28  o  http://192.168.100.28:8001/):",
                AutoSize = true,
                Location = new Point(20, 290)
            });

            _manual = new TextBox
            {
                Location = new Point(22, 312),
                Size = new Size(536, 26),
                Text = forcePrompt ? "" : (Config.LoadUrl() ?? "")
            };
            if (string.IsNullOrWhiteSpace(_manual.Text))
            {
                var clip = UrlImport.FromClipboard();
                if (!string.IsNullOrEmpty(clip)) _manual.Text = clip;
            }
            Controls.Add(_manual);

            Controls.Add(new Label
            {
                Text = "En el Server: Configuracion > Equipos conectados > Copiar. Pegue aqui o pulse Pegar URL.",
                ForeColor = Color.FromArgb(100, 116, 139),
                Size = new Size(536, 32),
                Location = new Point(22, 344)
            });

            _btnSearch = new Button { Text = "Buscar", Location = new Point(22, 390), Size = new Size(100, 34) };
            _btnSearch.Click += async (s, e) => await SearchAsync();
            Controls.Add(_btnSearch);

            _btnPaste = new Button { Text = "Pegar URL", Location = new Point(130, 390), Size = new Size(100, 34) };
            _btnPaste.Click += (s, e) =>
            {
                var clip = UrlImport.FromClipboard();
                if (string.IsNullOrEmpty(clip))
                {
                    MessageBox.Show(
                        "El portapapeles no tiene una URL. En el Server pulse Copiar junto a http://IP:8001/",
                        "Pegar URL", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                _manual.Text = clip;
                Connect();
            };
            Controls.Add(_btnPaste);

            var btnRepair = new Button { Text = "Reparar red", Location = new Point(238, 390), Size = new Size(110, 34) };
            btnRepair.Click += (s, e) => LanRepair.RunElevated();
            Controls.Add(btnRepair);

            _btnConnect = new Button
            {
                Text = "Conectar",
                Location = new Point(360, 390),
                Size = new Size(110, 34),
                BackColor = Color.FromArgb(30, 136, 229),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnConnect.Click += (s, e) => Connect();
            Controls.Add(_btnConnect);

            var btnCancel = new Button { Text = "Cancelar", Location = new Point(478, 390), Size = new Size(80, 34) };
            btnCancel.Click += (s, e) => Close();
            Controls.Add(btnCancel);

            AcceptButton = _btnConnect;
            CancelButton = btnCancel;

            Shown += async (s, e) =>
            {
                RefreshWarnings();
                await SearchAsync();
            };
        }

        private void RefreshWarnings()
        {
            var parts = new List<string>();
            var vpn = LanRepair.DetectVpnWarning();
            var pub = LanRepair.DetectPublicNetworkWarning();
            if (!string.IsNullOrEmpty(vpn)) parts.Add(vpn);
            if (!string.IsNullOrEmpty(pub)) parts.Add(pub);
            _warn.Text = string.Join("  ", parts.ToArray());
        }

        private async Task SearchAsync()
        {
            try
            {
                _cts?.Cancel();
                _cts = new CancellationTokenSource();
                var token = _cts.Token;
                RefreshWarnings();

                _btnSearch.Enabled = false;
                _btnConnect.Enabled = false;
                _btnPaste.Enabled = false;
                Cursor = Cursors.WaitCursor;
                _list.Items.Clear();
                _hits.Clear();
                _status.Text = "Buscando servidores N&K DentalSoft...";

                List<ServerHit> hits = null;
                await Task.Run(() =>
                {
                    hits = Discovery.FindServers(msg =>
                    {
                        try { BeginInvoke(new Action(() => { _status.Text = msg; })); }
                        catch { }
                    }, token);
                }, token);

                if (IsDisposed) return;
                _hits.AddRange(hits ?? new List<ServerHit>());
                foreach (var h in _hits) _list.Items.Add(h.ToString());

                if (_hits.Count == 0)
                {
                    _status.Text = "No se encontro servidor. En el PC servidor pulse Copiar (Configuracion) y aqui Pegar URL — o escriba 192.168.100.28";
                    if (string.IsNullOrWhiteSpace(_manual.Text) || _manual.Text == "192.168.")
                        _manual.Text = "192.168.100.";
                    _manual.Focus();
                    _manual.SelectionStart = _manual.Text.Length;
                }
                else
                {
                    _status.Text = "Se encontraron " + _hits.Count + " servidor(es). Pulse Conectar.";
                    _list.SelectedIndex = 0;
                    _manual.Text = _hits[0].Url;
                }
            }
            catch (OperationCanceledException) { _status.Text = "Busqueda cancelada."; }
            catch (Exception ex)
            {
                Logger.Error(ex);
                _status.Text = "Error: " + ex.Message;
            }
            finally
            {
                if (!IsDisposed)
                {
                    _btnSearch.Enabled = true;
                    _btnConnect.Enabled = true;
                    _btnPaste.Enabled = true;
                    Cursor = Cursors.Default;
                }
            }
        }

        private void Connect()
        {
            var raw = (_manual.Text ?? "").Trim();
            var looksLikeHostname = Regex.IsMatch(raw, @"DESKTOP-|http://[A-Za-z]", RegexOptions.IgnoreCase)
                && !Regex.IsMatch(raw, @"\d+\.\d+\.\d+\.\d+");
            var url = UrlImport.Normalize(raw) ?? raw;
            if (string.IsNullOrEmpty(url) || looksLikeHostname && UrlImport.PreferNumericIpUrl(raw) == null)
            {
                MessageBox.Show(
                    "Debe usar la IP numerica del servidor, no el nombre del PC.\n\n" +
                    "Correcto:  192.168.100.28\n" +
                    "Correcto:  http://192.168.100.28:8001/\n" +
                    "Incorrecto: DESKTOP-HPLNJJ1\n\n" +
                    "En el Server: Configuracion > Copiar la URL que dice \"Usar esta (IP)\".",
                    "Use la IP, no el nombre",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            _status.Text = "Comprobando " + url + "...";
            Application.DoEvents();

            var hit = Discovery.ProbeUrl(url, 2500);
            if (hit == null)
            {
                var pingOk = false;
                var hostOnly = "";
                try
                {
                    var u = new Uri(url.StartsWith("http") ? url : "http://" + url);
                    hostOnly = u.Host;
                    if (Regex.IsMatch(hostOnly, @"^\d+\.\d+\.\d+\.\d+$"))
                    {
                        using (var ping = new Ping())
                        {
                            var reply = ping.Send(hostOnly, 1500);
                            pingOk = reply != null && reply.Status == IPStatus.Success;
                        }
                    }
                }
                catch { }

                var extra = LanRepair.DetectVpnWarning() ?? LanRepair.DetectPublicNetworkWarning() ?? "";
                var diag = pingOk
                    ? "El PC servidor RESPONDE al ping, pero el puerto 8001 esta bloqueado (firewall del Server o antivirus). En el Server ejecute como Administrador: scripts\\repair_lan.ps1"
                    : "El PC servidor NO responde ni al ping. Causa tipica: aislamiento Wi-Fi del router (AP/Client Isolation), VPN, o distinta red. Conecte el Server por cable Ethernet o desactive el aislamiento en el router.";

                MessageBox.Show(
                    "No hay respuesta de N&K DentalSoft en:\n" + url +
                    "\n\nDiagnostico: " + diag +
                    "\n\n1) Server encendido en el PC principal" +
                    "\n2) Misma Wi-Fi/LAN (perfil Privado)" +
                    "\n3) Desactive VPN en este PC" +
                    "\n4) Firewall + EXE permitidos (repair_lan.ps1 como Admin en el Server)" +
                    "\n5) Use la IP (192.168.x.x), NUNCA DESKTOP-..." +
                    (string.IsNullOrEmpty(extra) ? "" : "\n\n" + extra),
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
