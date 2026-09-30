import { handleSalesHubCory } from '../salesHubCoryController';
import * as helper from '../../intelligence/assistant/openaiHelper';

jest.mock('../../intelligence/assistant/openaiHelper');
const mockedChat = helper.chatCompletion as jest.MockedFunction<typeof helper.chatCompletion>;

function mockRes() {
  const res: any = {};
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  return res;
}

describe('handleSalesHubCory', () => {
  beforeEach(() => jest.clearAllMocks());

  // failure path: malformed input never reaches the LLM
  it('returns 400 on invalid body', async () => {
    const req: any = { body: { question: '' } };
    const res = mockRes();
    await handleSalesHubCory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedChat).not.toHaveBeenCalled();
  });

  // happy path: a generated reply is returned (not a canned KB entry)
  it('returns the generated reply on success', async () => {
    mockedChat.mockResolvedValue('Cory composes a human answer.');
    const req: any = { body: { question: 'What does it cost?', context: [{ q: 'Price?', a: '$149/mo annual.' }] } };
    const res = mockRes();
    await handleSalesHubCory(req, res);
    expect(res.json).toHaveBeenCalledWith({ reply: 'Cory composes a human answer.' });
  });

  // failure path: LLM unavailable -> 503 so the client falls back to local retrieval
  it('returns 503 when the assistant is unavailable', async () => {
    mockedChat.mockResolvedValue(null);
    const req: any = { body: { question: 'What does it cost?' } };
    const res = mockRes();
    await handleSalesHubCory(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
