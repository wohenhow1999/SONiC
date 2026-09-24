(function () {
  const F = [
    ['設定', '/etc/sonic/config_db.json', '持久化的 CONFIG_DB 內容，開機與 config reload 時載入'],
    ['設定', '/etc/sonic/minigraph.xml', 'minigraph 拓樸設定（config load_minigraph）'],
    ['設定', '/etc/sonic/init_cfg.json', '預設功能設定（FEATURE 等），首次開機合併'],
    ['設定', '/etc/sonic/copp_cfg.json', '預設 CoPP 設定'],
    ['設定', '/etc/sonic/sonic_version.yml', '版本資訊（show version 讀取）'],
    ['設定', '/etc/sonic/frr/', 'FRR 設定（split / unified 模式時使用）'],
    ['設定', '/etc/sonic/old_config/', '升級時由舊映像遷移的設定備份'],
    ['平台', '/usr/share/sonic/device/<platform>/', '平台目錄：platform_env.conf、pcie.yaml、sensors.conf、plugins/'],
    ['平台', '/usr/share/sonic/device/<platform>/<hwsku>/', 'hwsku 目錄：port_config.ini / hwsku.json、qos.json.j2、buffers.json.j2、sai.profile、廠商 ASIC 設定檔'],
    ['平台', '/usr/share/sonic/device/<platform>/platform.json', 'port breakout 模式與平台元件描述'],
    ['平台', '/host/machine.conf', 'ONIE 提供的平台名稱與機器資訊'],
    ['平台', '/usr/share/sonic/templates/', '服務設定的 Jinja2 範本'],
    ['資料庫', '/var/run/redis/sonic-db/database_config.json', 'DB 名稱、編號、分隔符號與實例設定'],
    ['資料庫', '/var/run/redis/redis.sock', 'Redis unix socket'],
    ['資料庫', '/host/warmboot/dump.rdb', 'warm reboot 時保存的 Redis 快照'],
    ['日誌', '/var/log/syslog', '所有服務的主要 log（容器內 rsyslog 轉送至 host）'],
    ['日誌', '/var/log/swss/sairedis.rec', 'orchagent 送往 SAI 的所有操作紀錄（會輪替）'],
    ['日誌', '/var/log/swss/swss.rec', 'orchagent 消費的 APPL_DB 變更紀錄'],
    ['日誌', '/var/log/frr/', 'FRR log（視設定而定）'],
    ['日誌', '/var/log/auth.log', '登入與 sudo 紀錄'],
    ['除錯', '/var/core/', 'core dump（*.core.gz）'],
    ['除錯', '/var/dump/', 'show techsupport 產生的壓縮檔'],
    ['映像', '/host/image-<version>/', '每個安裝版本的目錄：fs.squashfs、docker/、rw/、boot/'],
    ['映像', '/host/grub/grub.cfg', '開機選單（sonic-installer 管理）'],
    ['映像', '/host/reboot-cause/', '重開機原因紀錄'],
    ['程式', '/usr/local/bin/', 'SONiC 腳本與工具：<service>.sh、fast-reboot、route_check.py、portstat…'],
    ['程式', '/lib/systemd/system/', '各服務的 systemd unit（swss.service、syncd.service…）'],
    ['容器內', '/usr/bin/orchagent', 'swss 容器中的 orchagent 執行檔'],
    ['容器內', '/etc/supervisor/conf.d/supervisord.conf', '容器內 supervisord 設定（啟動哪些程序、critical_processes）'],
    ['容器內', '/usr/share/sonic/hwsku/', '容器中掛載的 hwsku 目錄'],
  ];

  S.register({
    id: 'ref-files',
    category: 'ref',
    order: 3,
    title: '檔案與日誌路徑',
    en: 'Files & Log Locations',
    summary: 'SONiC 在 host 與容器中的重要檔案、設定、平台目錄、日誌與除錯資料路徑。',
    meta: [
      ['注意', '容器內與 host 的路徑不同；hwsku 目錄在容器中通常掛載為 <code>/usr/share/sonic/hwsku</code>'],
    ],
    tags: ['files', 'paths', 'logs', 'syslog', 'hwsku', 'platform'],
    html: `<div id="files"></div>`,
    searchText: F.map(r => r.join(' ')).join(' '),
    mount(root) {
      const host = root.querySelector('#files');
      const groups = [...new Set(F.map(r => r[0]))];
      groups.forEach(g => {
        host.insertAdjacentHTML('beforeend', `<h2>${S.esc(g)}</h2><div class="tbl"><table class="wrap"><thead><tr><th>路徑</th><th>說明</th></tr></thead><tbody>${F.filter(r => r[0] === g).map(r => `<tr><td><code>${S.esc(r[1])}</code></td><td>${S.esc(r[2])}</td></tr>`).join('')}</tbody></table></div>`);
      });
    },
    related: ['troubleshooting', 'config', 'build'],
  });
})();
