const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'dsh-embed-panel.ts'),
    'utf8',
);

test('embed panel builds iframe host for full DSH page', () => {
    assert.match(src, /frame-src/);
    assert.match(src, /simpleBrowser\.show/);
    assert.match(src, /agentsWindowMode/);
    assert.match(src, /buildDshEmbedHtml/);
});

test('agents-window defaults to embed path', () => {
    const aw = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'agents-window.ts'),
        'utf8',
    );
    assert.match(aw, /openDshEmbeddedInIde/);
    assert.match(aw, /readAgentsWindowMode/);
    assert.match(aw, /mode === 'embed'/);
});
