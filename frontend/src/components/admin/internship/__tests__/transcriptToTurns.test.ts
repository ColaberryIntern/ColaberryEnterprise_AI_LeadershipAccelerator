import { transcriptToTurns } from '../SpokenIntake';

/**
 * A Synthflow transcript reads as the same turns the typed interview shows.
 * The one real transcript on file looks like `human: ...` lines; the agent's side is
 * `agent:`. Anything else is kept rather than dropped.
 */
describe('transcriptToTurns', () => {
  it('splits speaker lines into assistant and user turns', () => {
    const t = transcriptToTurns('agent: Tell me about the project.\nhuman: We run a tool library.\nagent: Who runs the desk?');
    expect(t).toEqual([
      { role: 'assistant', text: 'Tell me about the project.' },
      { role: 'user', text: 'We run a tool library.' },
      { role: 'assistant', text: 'Who runs the desk?' },
    ]);
  });

  it('is case-insensitive and tolerant of the other names the speakers go by', () => {
    const t = transcriptToTurns('AI: Hi.\nUser: Hello.\nAssistant: Go on.\nCustomer: Sure.');
    expect(t.map((x) => x.role)).toEqual(['assistant', 'user', 'assistant', 'user']);
  });

  it('continues a turn across an unlabelled line rather than losing it', () => {
    const t = transcriptToTurns('human: We have two problems.\nThe first is the paper sheet.\nagent: And the second?');
    expect(t[0]).toEqual({ role: 'user', text: 'We have two problems.\nThe first is the paper sheet.' });
    expect(t).toHaveLength(2);
  });

  it('handles CRLF, blank lines and leading whitespace', () => {
    const t = transcriptToTurns('\r\n  agent:  Hi there. \r\n\r\nhuman:Hello\r\n');
    expect(t).toEqual([{ role: 'assistant', text: 'Hi there.' }, { role: 'user', text: 'Hello' }]);
  });

  it('shows text with no speaker at all rather than nothing', () => {
    expect(transcriptToTurns('Call connected. Line noise.')).toEqual([{ role: 'assistant', text: 'Call connected. Line noise.' }]);
  });

  it('is empty for an empty transcript', () => {
    expect(transcriptToTurns('')).toEqual([]);
  });
});
