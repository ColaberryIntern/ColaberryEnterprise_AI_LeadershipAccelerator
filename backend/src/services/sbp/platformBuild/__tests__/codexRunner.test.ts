/**
 * The build runner's pure parts (scripts/platformBuild/*.cjs) and the workflow's key handling.
 * They live outside backend/src because they run on the GitHub runner, never in the backend.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../../../..');
const config = require(path.join(ROOT, 'scripts/platformBuild/codexConfig.cjs'));
const { collectUpload } = require(path.join(ROOT, 'scripts/platformBuild/collectUpload.cjs'));
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/platform-build-runner.yml'), 'utf8');

describe('codexConfigToml', () => {
  const toml: string = config.codexConfigToml({ model: 'gpt-6.2-sol', proxyPort: 4100 });

  it('keeps the network, web search and the environment closed, and never asks', () => {
    expect(toml).toContain('default_permissions = ":workspace"');
    expect(toml).not.toMatch(/network_access = true|danger|sandbox_mode/);
    expect(toml).toContain('web_search = "disabled"');
    expect(toml).toMatch(/\[shell_environment_policy\]\ninherit = "none"/);
    expect(toml).toContain('approval_policy = "never"');
    expect(toml).toContain('base_url = "http://127.0.0.1:4100/v1"');
  });

  it('carries no key setting: only the proxy holds the key', () => {
    expect(toml).not.toMatch(/api_key|env_key|bearer/i);
  });

  it('refuses a model id or port that could inject config', () => {
    expect(() => config.codexConfigToml({ model: 'x"\nnetwork_access = true', proxyPort: 1 })).toThrow();
    expect(() => config.codexConfigToml({ model: 'gpt-6.2-sol', proxyPort: 0 })).toThrow();
  });
});

describe('costUsd', () => {
  it('prices cached input at the cached rate', () => {
    expect(config.costUsd('gpt-6.2-sol', { input: 1_000_000, cached: 500_000, output: 100_000 })).toBeCloseTo(1 + 0.05 + 1);
  });

  it('is null, not zero, for a model with no known price', () => {
    expect(config.costUsd('mystery', { input: 1, cached: 0, output: 1 })).toBeNull();
  });

  it('prices the default model', () => {
    expect(config.PRICES[config.DEFAULT_MODEL]).toBeDefined();
  });
});

describe('readEvent', () => {
  const fold = (...events: unknown[]) =>
    events.reduce((s: any, e) => config.readEvent(s, typeof e === 'string' ? e : JSON.stringify(e)), config.newState());

  it('collects usage and the last message', () => {
    const s = fold(
      { type: 'item.completed', item: { type: 'agent_message', text: 'PLATFORM_BUILD_DONE' } },
      { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 } },
    );
    expect(s).toMatchObject({ completed: true, failed: false, lastMessage: 'PLATFORM_BUILD_DONE', usage: { input: 10, cached: 4, output: 3 } });
  });

  it('marks a failed turn, but treats a bare error as a retry', () => {
    expect(fold({ type: 'turn.failed', error: { message: 'boom' } })).toMatchObject({ failed: true, error: 'boom' });
    expect(fold({ type: 'error', message: 'reconnecting' }).failed).toBe(false);
  });

  it('survives malformed, empty and null lines', () => {
    expect(fold('not json', '', 'null')).toMatchObject({ completed: false, unreadable: 2 });
  });
});

describe('classifyFailure', () => {
  it.each([
    ['unexpected status 401 Unauthorized', 'AuthError'],
    ['You exceeded your current quota', 'QuotaError'],
    ['429 Too Many Requests', 'RateLimitError'],
    ['The model `x` does not exist', 'ModelUnavailable'],
    ['stream disconnected before completion', 'UpstreamUnavailable'],
    ['something else', 'AgentIncomplete'],
  ])('%s -> %s', (message, expected) => {
    expect(config.classifyFailure(message)).toBe(expected);
  });
});

describe('collectUpload', () => {
  let dir: string;
  let secret: string;
  beforeEach(() => {
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'upload-')));
    secret = path.join(os.tmpdir(), `outside-${path.basename(dir)}`);
    fs.mkdirSync(secret);
    fs.writeFileSync(path.join(secret, 'leak.html'), 'SECRET');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(secret, { recursive: true, force: true });
  });

  it('takes the accepted files and skips the rest', () => {
    fs.mkdirSync(path.join(dir, 'command-center/sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'demo'));
    fs.writeFileSync(path.join(dir, 'index.html'), 'x');
    fs.writeFileSync(path.join(dir, 'command-center/sub/a.js'), 'x');
    fs.writeFileSync(path.join(dir, 'command-center/a.svg'), 'x');
    fs.writeFileSync(path.join(dir, 'demo/demo-spec.json'), '{}');
    const out = collectUpload(dir);
    expect(Object.keys(out.files).sort()).toEqual(['command-center/sub/a.js', 'demo/demo-spec.json', 'index.html']);
    expect(out.skipped).toBe(1);
  });

  it('is empty for an empty workspace', () => {
    expect(collectUpload(dir)).toEqual({ files: {}, skipped: 0 });
  });

  it('never follows a linked directory out of the workspace', () => {
    // 'junction' needs no privilege on Windows and is an ordinary symlink elsewhere.
    fs.symlinkSync(secret, path.join(dir, 'command-center'), 'junction');
    expect(JSON.stringify(collectUpload(dir))).not.toContain('SECRET');
  });

  it('never publishes a hard link to a file elsewhere', () => {
    fs.linkSync(path.join(secret, 'leak.html'), path.join(dir, 'index.html'));
    expect(collectUpload(dir).files).toEqual({});
  });

  (process.platform === 'win32' ? it.skip : it)('never follows a linked file out of the workspace', () => {
    fs.symlinkSync(path.join(secret, 'leak.html'), path.join(dir, 'index.html'));
    expect(collectUpload(dir).files).toEqual({});
  });
});

describe('platform-build-runner.yml', () => {
  it('gives the key to the proxy step only, after which nothing can become root', () => {
    expect(workflow.match(/secrets\.[A-Z_]+/g)).toEqual(['secrets.OPENAI_API_KEY']);
    const at = (name: string) => workflow.indexOf(`- name: ${name}`);
    const secretAt = workflow.indexOf('secrets.OPENAI_API_KEY');
    expect(at('Start the key proxy')).toBeLessThan(secretAt);
    expect(secretAt).toBeLessThan(at('Drop sudo'));
    expect(at('Drop sudo')).toBeLessThan(at('Build and upload'));
  });

  it('installs the Codex version this code was checked against', () => {
    const prepare = fs.readFileSync(path.join(ROOT, 'scripts/platformBuild/prepareRunner.sh'), 'utf8');
    expect(prepare).toContain(`CODEX_VERSION=${config.CODEX_VERSION} `);
  });
});
