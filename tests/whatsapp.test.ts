import { enviarMensagemTexto } from '@/infra/whatsapp';

function mockResponse(status: number, body: Record<string, unknown> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('infra/whatsapp - retry', () => {
  beforeAll(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'id-teste';
    process.env.WHATSAPP_TOKEN = 'token-teste';
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('não tenta de novo quando dá certo na primeira', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse(200, { messages: [{ id: '1' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await enviarMensagemTexto('5511999999999', 'oi');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo em erro 500 e funciona na segunda tentativa', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200, { messages: [{ id: '1' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = enviarMensagemTexto('5511999999999', 'oi');
    await jest.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tenta de novo em erro 429 (rate limit)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, { messages: [{ id: '1' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = enviarMensagemTexto('5511999999999', 'oi');
    await jest.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('esgota as 3 tentativas e lança erro se sempre der 500', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = enviarMensagemTexto('5511999999999', 'oi');
    const expectativa = expect(promise).rejects.toThrow();
    await jest.runAllTimersAsync();
    await expectativa;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('NÃO tenta de novo em erro 4xx (não é temporário)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(mockResponse(400, { error: { message: 'Requisição inválida' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(enviarMensagemTexto('5511999999999', 'oi')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mapeia erro 130497 (restrição de país) pra AppError com mensagem clara', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(mockResponse(400, { error: { code: 130497, message: 'restricted' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(enviarMensagemTexto('5511999999999', 'oi')).rejects.toThrow(/restrita/i);
  });
});
