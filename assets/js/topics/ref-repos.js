(function () {
  const R = [
    ['sonic-buildimage', '建置', '主建置倉庫：Makefile、dockers/、platform/<vendor>/、files/（systemd、腳本、範本）、device/（平台與 hwsku）、src/（submodule）', 'dockers/, platform/, device/, files/build_templates/'],
    ['sonic-swss', '核心', 'orchagent 與 cfgmgr（*mgrd）、portsyncd、neighsyncd、fpmsyncd、fdbsyncd、teamsyncd', 'orchagent/, cfgmgr/, fpmsyncd/, neighsyncd/, portsyncd/'],
    ['sonic-swss-common', '核心', 'Redis 存取函式庫：Table、ProducerStateTable、ConsumerStateTable、SubscriberStateTable、DBConnector、Python swsscommon', 'common/'],
    ['sonic-sairedis', '核心', 'libsairedis、syncd、saimeta（SAI metadata 驗證）、saivs（虛擬 SAI）、saiplayer', 'lib/, syncd/, meta/, vslib/'],
    ['SAI (opencomputeproject)', '核心', 'SAI 標頭檔與規格', 'inc/, experimental/, doc/'],
    ['sonic-utilities', 'CLI', 'show / config / sonic-installer / 各種維運腳本', 'show/, config/, scripts/, sonic_installer/, generic_config_updater/'],
    ['sonic-platform-common', '平台', 'Platform API 基底類別（sonic_platform_base）與 transceiver 解析（sonic_xcvr, CMIS）', 'sonic_platform_base/'],
    ['sonic-platform-daemons', '平台', 'pmon daemons：xcvrd、psud、thermalctld、ledd、syseepromd、pcied、chassisd', 'sonic-xcvrd/, sonic-psud/, sonic-thermalctld/'],
    ['sonic-host-services', '系統', 'host 端服務：hostcfgd、caclmgrd、procdockerstatsd、determine-reboot-cause', 'scripts/'],
    ['sonic-bgpcfgd（位於 sonic-buildimage/src）', '路由', 'bgpcfgd：CONFIG_DB → FRR 設定', 'src/sonic-bgpcfgd/'],
    ['sonic-frr（位於 sonic-buildimage/src）', '路由', 'SONiC 使用的 FRR 版本與修補', 'src/sonic-frr/'],
    ['sonic-config-engine（位於 sonic-buildimage/src）', '設定', 'sonic-cfggen、minigraph 解析、Jinja2 範本工具', 'src/sonic-config-engine/'],
    ['sonic-yang-models（位於 sonic-buildimage/src）', '設定', 'CONFIG_DB 的 YANG 模型', 'src/sonic-yang-models/yang-models/'],
    ['sonic-gnmi', '管理', 'gNMI / telemetry 伺服器與 dial-out client', 'gnmi_server/, sonic_data_client/'],
    ['sonic-mgmt-framework', '管理', 'REST / Klish CLI 管理框架（translib）', 'rest/, CLI/'],
    ['sonic-snmpagent', '管理', 'SNMP AgentX 子代理（Python）', 'src/sonic_ax_impl/'],
    ['sonic-dbsyncd', '管理', 'lldp_syncd 等 DB 同步工具', 'src/lldp_syncd/'],
    ['sonic-mgmt', '測試', '端對端測試框架（Ansible + pytest），涵蓋功能與 warm reboot 測試', 'tests/, ansible/'],
    ['SONiC', '文件', '設計文件（HLD）、Wiki、roadmap', 'doc/'],
  ];

  S.register({
    id: 'ref-repos',
    category: 'ref',
    order: 4,
    title: '原始碼倉庫地圖',
    en: 'Source Repository Map',
    summary: 'SONiC 主要原始碼倉庫與各自負責的元件，以及閱讀原始碼時的入口目錄。所有倉庫位於 GitHub 的 sonic-net 組織（SAI 位於 opencomputeproject）。',
    meta: [
      ['組織', ['github.com/sonic-net', 'github.com/opencomputeproject/SAI']],
      ['建置入口', ['sonic-buildimage（submodule 引入其餘倉庫）']],
    ],
    tags: ['source', 'repository', 'github', 'sonic-swss', 'sonic-sairedis', 'sonic-utilities'],
    html: `
<h2>倉庫一覽</h2>
<div id="repos"></div>
<h2>閱讀原始碼的起點</h2>
<table class="wrap">
<thead><tr><th>想了解</th><th>從這裡開始</th></tr></thead>
<tbody>
<tr><td>orchagent 主迴圈與各 Orch 的建立順序</td><td><code>sonic-swss/orchagent/orchdaemon.cpp</code>（<code>OrchDaemon::init()</code>、<code>start()</code>）</td></tr>
<tr><td>Orch 基底類別、m_toSync 與 doTask</td><td><code>sonic-swss/orchagent/orch.cpp</code>、<code>orch.h</code></td></tr>
<tr><td>port 初始化</td><td><code>sonic-swss/orchagent/portsorch.cpp</code>（<code>doPortTask</code>、<code>initializePorts</code>）</td></tr>
<tr><td>路由下發與 ECMP</td><td><code>sonic-swss/orchagent/routeorch.cpp</code>、<code>nexthopgroup</code> 相關</td></tr>
<tr><td>ProducerStateTable 的 Lua 腳本</td><td><code>sonic-swss-common/common/producerstatetable.cpp</code>、<code>consumer_state_table_pops.lua</code></td></tr>
<tr><td>sairedis 序列化與 syncd 主迴圈</td><td><code>sonic-sairedis/lib/RedisRemoteSaiInterface.cpp</code>、<code>syncd/Syncd.cpp</code></td></tr>
<tr><td>VID/RID 轉換</td><td><code>sonic-sairedis/syncd/VirtualOidTranslator.cpp</code></td></tr>
<tr><td>Flex counter</td><td><code>sonic-sairedis/syncd/FlexCounter.cpp</code>、<code>sonic-swss/orchagent/flexcounterorch.cpp</code></td></tr>
<tr><td>config / show 指令</td><td><code>sonic-utilities/config/main.py</code>、<code>show/main.py</code></td></tr>
<tr><td>容器的組成</td><td><code>sonic-buildimage/dockers/docker-orchagent/</code>（Dockerfile.j2、supervisord.conf.j2、critical_processes）</td></tr>
</tbody></table>
`,
    searchText: R.map(r => r.join(' ')).join(' '),
    mount(root) {
      root.querySelector('#repos').innerHTML = `<table class="wrap"><thead><tr><th>倉庫</th><th>分類</th><th>內容</th><th>主要目錄</th></tr></thead><tbody>${R.map(r => {
        const name = r[0].split('（')[0];
        const url = name.startsWith('SAI') ? 'https://github.com/opencomputeproject/SAI' : r[0].includes('sonic-buildimage/src') ? 'https://github.com/sonic-net/sonic-buildimage' : 'https://github.com/sonic-net/' + name;
        return `<tr><td><a href="${url}" target="_blank" rel="noopener"><code>${S.esc(r[0])}</code></a></td><td><span class="badge n">${S.esc(r[1])}</span></td><td>${S.esc(r[2])}</td><td><code>${S.esc(r[3])}</code></td></tr>`;
      }).join('')}</tbody></table>`;
    },
    related: ['swss', 'syncd-sai', 'build'],
  });
})();
