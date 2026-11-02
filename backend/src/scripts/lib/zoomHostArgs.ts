/**
 * Argument parsing for `zoomHosts.ts register`, kept separate so it can be tested.
 *
 * WHY THIS IS NOT INLINE IN THE SCRIPT. `zoomHosts.ts` runs `main()` at module load
 * and ends in `process.exit`, so importing it from a test runs the tool. The decisions
 * worth pinning — what a purpose may be, what happens to a mistyped flag — live here
 * instead, where a test can reach them without a database or a process exit.
 *
 * WHY AN UNKNOWN FLAG IS AN ERROR RATHER THAN IGNORED. `--purpse=room` would otherwise
 * be dropped silently and the host would register as `any`, which is precisely the
 * cross-purpose collision the flag exists to prevent (see `HOST_PURPOSES`). A typo
 * must not quietly produce the hazardous default.
 */

import { HOST_PURPOSES, isHostPurpose, type HostPurpose } from '../../services/zoom/zoomHostRegistry';

export interface RegisterArgs {
  email: string;
  label: string | null;
  /** Left undefined so `registerHost` applies its own default rather than this file guessing one. */
  priority: number | undefined;
  purpose: HostPurpose;
}

export type ParseResult =
  | { ok: true; args: RegisterArgs }
  | { ok: false; error: string };

const FLAG_NAMES = ['purpose', 'label', 'priority'] as const;
type FlagName = (typeof FLAG_NAMES)[number];

const isFlagName = (value: string): value is FlagName =>
  (FLAG_NAMES as readonly string[]).includes(value);

export const REGISTER_USAGE =
  'usage: zoomHosts.ts register <email> [label] [priority] [--purpose=any|room|practice]';

/**
 * Splits argv into named flags and positionals.
 *
 * Positional order is unchanged from before flags existed (`<email> [label]
 * [priority]`), so anything already written against this tool keeps working. A flag may
 * appear anywhere, including before the email.
 */
export function parseRegisterArgs(argv: readonly string[]): ParseResult {
  const flags = new Map<FlagName, string>();
  const positionals: string[] = [];

  for (const raw of argv) {
    const token = String(raw ?? '');
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    if (!token.startsWith('--')) {
      return { ok: false, error: `Unknown option "${token}". Options are long form, e.g. --purpose=room.` };
    }
    const eq = token.indexOf('=');
    if (eq < 0) {
      // `--purpose room` would consume the email as a value and register the wrong
      // address, so the separator is required rather than inferred.
      return { ok: false, error: `Option "${token}" needs a value, written as ${token}=<value>.` };
    }
    const name = token.slice(2, eq);
    if (!isFlagName(name)) {
      return { ok: false, error: `Unknown option "--${name}". Known options: ${FLAG_NAMES.map((f) => `--${f}`).join(', ')}.` };
    }
    if (flags.has(name)) {
      return { ok: false, error: `Option --${name} was given twice.` };
    }
    flags.set(name, token.slice(eq + 1));
  }

  const [email, positionalLabel, positionalPriority] = positionals;
  if (!email || !email.trim()) {
    return { ok: false, error: REGISTER_USAGE };
  }
  if (positionals.length > 3) {
    return { ok: false, error: `Too many arguments. ${REGISTER_USAGE}` };
  }

  // Both forms given for one value is ambiguous, and picking a winner silently is how
  // an operator ends up with a label or priority they did not choose.
  if (flags.has('label') && positionalLabel !== undefined) {
    return { ok: false, error: 'Label given twice, once positionally and once as --label.' };
  }
  if (flags.has('priority') && positionalPriority !== undefined) {
    return { ok: false, error: 'Priority given twice, once positionally and once as --priority.' };
  }

  const purposeRaw = flags.get('purpose') ?? 'any';
  if (!isHostPurpose(purposeRaw)) {
    return {
      ok: false,
      error: `Unknown purpose "${purposeRaw}". Valid purposes: ${HOST_PURPOSES.join(', ')}.`,
    };
  }

  const priorityRaw = flags.get('priority') ?? positionalPriority;
  let priority: number | undefined;
  if (priorityRaw !== undefined && String(priorityRaw).trim() !== '') {
    const parsed = Number(priorityRaw);
    // `Number('high')` is NaN, which the old code passed straight to SQL. A rejected
    // insert is a better outcome than a row whose ordering is undefined, and a message
    // is better than either.
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: `Priority must be a whole number, zero or above. Got "${priorityRaw}".` };
    }
    priority = parsed;
  }

  const label = flags.get('label') ?? positionalLabel ?? null;

  return {
    ok: true,
    args: {
      email: email.trim(),
      label: label === null || label === '' ? null : label,
      priority,
      purpose: purposeRaw,
    },
  };
}
