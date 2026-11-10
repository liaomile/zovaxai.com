import { describe, expect, it } from 'vitest'
import {
  describeGitStatus,
  joinWorkspacePath,
  parseGitPorcelain,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/panels/ChangesPanel.tsx'
import {
  formatElapsed,
  formatPwshPrompt,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/panels/TerminalPanel.tsx'

describe('Agents Window helpers', () => {
  it('formats a workspace PowerShell prompt for any drive path', () => {
    expect(formatPwshPrompt('D:\\proj\\app')).toBe('PS D:\\proj\\app>')
    expect(formatPwshPrompt('')).toBe('PS>')
  })

  it('parses git porcelain including renames', () => {
    const rows = parseGitPorcelain(
      ' M src/a.ts\n?? new.md\nR  old.ts -> src/b.ts\n',
    )
    expect(rows).toEqual([
      { index: ' ', worktree: 'M', path: 'src/a.ts' },
      { index: '?', worktree: '?', path: 'new.md' },
      { index: 'R', worktree: ' ', path: 'src/b.ts', origPath: 'old.ts' },
    ])
    expect(describeGitStatus(' ', 'M')).toBe('Modified')
    expect(describeGitStatus('?', '?')).toBe('Untracked')
    expect(describeGitStatus('R', ' ')).toBe('Renamed')
  })

  it('joins relative git paths onto the live workspace cwd', () => {
    expect(joinWorkspacePath('E:\\ws\\demo', 'src/a.ts')).toBe('E:\\ws\\demo\\src\\a.ts')
    expect(joinWorkspacePath('/tmp/ws', 'src/a.ts')).toBe('/tmp/ws/src/a.ts')
  })

  it('formats agent elapsed time', () => {
    const t0 = 1_000_000
    expect(formatElapsed(t0, t0 + 12_000)).toBe('12s')
    expect(formatElapsed(t0, t0 + 64_000)).toBe('1m 4s')
    expect(formatElapsed(t0, t0 + 3_600_000)).toBe('1h 0m')
  })
})
