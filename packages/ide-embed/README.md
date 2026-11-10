# packages/ide-embed 鈥?IDE 鍐呭祵鑳舵按

鎶婂畬鏁?DSH 鍓嶇锛圓gents Window锛夋暣椤靛祵杩涚紪杈戝櫒鐨勬墿灞曞疄鐜帮紝鐢ㄤ簬锛?
- 鍦ㄥ師鐗?VS Code 涓皟璇?婕旂ず宓屽叆鏁堟灉锛團5 鍚姩鎵╁睍瀹夸富锛屾墽琛屽懡浠?鈥淥pen Agents Window鈥濓級锛?- 浣滀负 fork 鐗?`contrib/deepseek` 鍘熺敓瀹炵幇鐨?*琛屼负鍩哄噯**锛堝悓涓€鍛戒护銆佸悓涓€閰嶇疆璇箟銆佸悓涓€榛樿鍦板潃锛夈€?
琛屼负绾﹀畾锛?
- 鍛戒护锛歚zovax.openAgentsWindow`锛屾爣棰?鈥淥pen Agents Window鈥濓紱
- 榛樿鍦板潃锛歚http://127.0.0.1:3080`锛岄厤缃」 `zovax.agentsWindow.url` 鍙敼锛?- 宓屽叆鏂瑰紡锛歐ebviewPanel + iframe 鏁撮〉鎵胯浇锛宍retainContextWhenHidden` 淇濈姸鎬侊紝涓嶅璺虫祻瑙堝櫒锛?- 鍙€夛細`zovax.agentsWindow.openOnStartup` 鍚姩鏃惰嚜鍔ㄦ墦寮€銆?
鏋勫缓锛歚pnpm --filter ide-embed build`锛堟垨鍦ㄦ湰鐩綍 `npm run build`锛夛紝浜х墿鍦?`dist/`銆?

## Nova Agent 参考源（并存）

同目录下的 `src/dsh-embed-panel.ts` / `dsh-sidecar.ts` / `agents-window.ts` 来自产品侧 Nova Agent，
可作为 fork / 扩展实现对照；当前可运行扩展入口仍是 `src/extension.ts`。
