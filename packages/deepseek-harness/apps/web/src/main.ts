/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * loader holding, module-table seeding, AppRoot gate, plugin assembly — lives
 * in @deepseek-ai/dsh-client-web; this file only finds the mount point.
 */
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
// Zovax fusion (vendored diff, listed in docs/FUSION.md): IDE embed bridge —
// when this page runs inside the IDE, lets the editor open files in its own UI
// and pushes theme/context to the page. No-op in a standalone browser.
import { installZovaxIdeBridge } from './zovax-bridge'

installZovaxIdeBridge()

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
