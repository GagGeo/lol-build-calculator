// index.html loads each script with a fingerprint of its content (stamp.py), so browsers can't mix a cached
// old script with a new page. Fails when a script changed and the stamp wasn't redone: run python3 stamp.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

test('every local script link carries the fingerprint of its current content', () => {
  const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
  const links = [...html.matchAll(/<script src="([\w.-]+\.js)(?:\?v=(\w+))?"><\/script>/g)];
  assert.ok(links.length >= 4, 'scripts found');
  for (const [, name, stamp] of links) {
    const digest = crypto.createHash('sha1').update(fs.readFileSync(`${__dirname}/${name}`)).digest('hex').slice(0, 10);
    assert.equal(stamp, digest, `${name}: run python3 stamp.py`);
  }
});
