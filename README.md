# Zovax AI

鎶婂畬鏁寸殑 DeepSeek Harness锛圖SH锛夊墠绔暣椤靛祵鍏?IDE 鐨?AI 浠ｇ爜缂栬緫鍣細
缂栬緫鍣ㄥ唴鐩存帴鎵撳紑鏁撮〉 Agents Window锛岃€屼笉鏄彟寮€ Chrome 绐楀彛銆?
## 浠撳簱缁撴瀯

```
zovaxai.com/
  packages/deepseek-harness/   瀹屾暣 DSH锛坴endored锛屽垵濮嬫爲鐢遍」鐩粍鎻愪緵锛岃窡闅忎笂娓稿悓姝ワ級
  packages/ide-embed/          IDE 鍐呭祵鑳舵按鎵╁睍锛圵ebview 鏁撮〉宓屽叆锛屽彲鐙珛鍦?VS Code 涓皟璇曪級
  contrib/deepseek/            VS Code fork 渚цˉ涓佹簮鐮侊紙鍚屾杩?fork 鐨?contrib/deepseek锛?  docs/                        璁捐鏂囨。锛欵MBEDDING锛堥瑕佽矾绾匡級/ DEEP-INTEGRATION锛堝苟琛岋級/ PORTING-MAP / ACCOUNT / PATCHES
  scripts/                     寮€鍙戣剼鏈細dev锛堣捣鍏ㄥ锛夈€乨sh-web锛堝彧璧?DSH 鍓嶇锛?```

鎶€鏈矾绾匡細**鍏堟暣椤靛祵鍏ュ彲鐢?*锛坉ocs/EMBEDDING.md锛夛紝鍘熺敓閲嶅啓锛坉ocs/DEEP-INTEGRATION.md锛夊苟琛屾帹杩涳紝涓嶆尅宓屽叆浜や粯銆?
## 楠屾敹鏍囧噯

1. `pnpm install` 鑳藉畬鎴愪緷璧栧畨瑁咃紱
2. `pnpm dsh:web` 鍚庯紝http://127.0.0.1:3080 鑳芥墦寮€瀹屾暣 Agents Window锛?3. IDE 閲屾墽琛屽懡浠?**鈥淥pen Agents Window鈥?* 榛樿浠?embed 鏂瑰紡鍦ㄧ紪杈戝櫒鍐呮墦寮€鏁撮〉锛屼笉鏄璺虫祻瑙堝櫒銆?
## 蹇€熷紑濮?
```bash
pnpm install     # 瀹夎渚濊禆
pnpm dev         # 涓€閿細瀹夎渚濊禆 -> 璧?DSH 鍓嶇(3080) -> 鎵撳嵃 IDE 鎵撳紑鏂瑰紡
# 鎴栧彧璧峰墠绔細
pnpm dsh:web     # http://127.0.0.1:3080
```

IDE 渚т袱绉嶆墦寮€鏂瑰紡锛堜换閫夊叾涓€锛岃涓轰竴鑷达級锛?
- **fork 鐗?*锛氭妸 `contrib/deepseek/` 鍚屾杩?VS Code fork 鍚庯紝鍛戒护闈㈡澘鎵ц 鈥淥pen Agents Window鈥濓紱
- **鍘熺増 VS Code 璋冭瘯**锛氫互 `packages/ide-embed/` 涓烘墿灞曠洰褰曞惎鍔ㄦ墿灞曞涓伙紙F5锛夛紝鍚屾牱鎵ц璇ュ懡浠ゃ€?
椤甸潰鍦板潃鍙厤缃紙榛樿 `http://127.0.0.1:3080`锛夛細fork 渚ч厤缃」 `deepseek.agentsWindowUrl`锛?鎵╁睍渚ч厤缃」 `zovax.agentsWindow.url`銆?
## 鎻愪氦绾㈢嚎锛堢姝㈠叆搴擄級

瀵嗛挜涓庝护鐗屻€乣.env`銆乣.venv`銆乣node_modules`銆佺敤鎴锋暟鎹€佸晢涓氬悗鍙扮鏈夐厤缃紝涓€寰嬩笉寰楁彁浜ゃ€?宸插湪 `.gitignore` 涓嫤鎴紱鏂版枃浠跺叆搴撳墠鑷煡涓€閬嶃€?
## 璁稿彲涓庡晢鏍?
- 鏈」鐩嚜鏈変唬鐮佷互 Apache-2.0 鍙戝竷锛堣 LICENSE锛夈€?- `packages/deepseek-harness/` 涓?DeepSeek Harness 鐨?vendored 鍓湰锛岄伒寰叾涓婃父璁稿彲銆?- VS Code 涓婃父浠ｇ爜涓?MIT 璁稿彲锛涙湰浜у搧涓虹嫭绔嬪彂琛岀増锛屼笉浣跨敤 鈥淰isual Studio Code鈥?鍚嶇О涓庡浘鏍囥€?

## 本批已填入的可运行内容

- `packages/deepseek-harness/`：完整 DSH 源码树（不含 `node_modules`；需 `pnpm install`）
- `config/dsh/`：品牌 / MCP overlay（仅 `process.env`，无密钥、无会话缓存）
- `packages/ide-embed/src/dsh-*.ts`、`agents-window.ts`：Nova Agent 侧内嵌参考实现（与 `extension.ts` 并存）
- `docs/OSS-DSH-IDE-CONTRACT.md`：协作契约
- `scripts/dev-dsh-web.bat`：Windows 一键起 DSH

