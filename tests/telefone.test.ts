import { normalizarTelefone, variantesDoTelefone } from '@/infra/telefone';

describe('infra/telefone', () => {
  it('normaliza para dígitos com DDI, como o webhook do WhatsApp', () => {
    expect(normalizarTelefone('(11) 99999-9999')).toBe('5511999999999');
    expect(normalizarTelefone('+55 11 99999-9999')).toBe('5511999999999');
    expect(normalizarTelefone('5511999999999')).toBe('5511999999999');
    expect(normalizarTelefone('11 3333-4444')).toBe('551133334444');
    expect(normalizarTelefone('0055 11 99999-9999')).toBe('5511999999999');
  });

  it('recusa números inválidos', () => {
    expect(normalizarTelefone('')).toBeNull();
    expect(normalizarTelefone('abc')).toBeNull();
    expect(normalizarTelefone('99999-9999')).toBeNull();
    expect(normalizarTelefone('(01) 99999-9999')).toBeNull();
    expect(normalizarTelefone('5511899999999')).toBeNull();
  });

  it('aceita número de outro país', () => {
    expect(normalizarTelefone('+1 415 555 2671')).toBe('14155552671');
  });

  it('gera as duas grafias do celular brasileiro, e só dele', () => {
    expect(variantesDoTelefone('5511999999999')).toEqual(['5511999999999', '551199999999']);
    expect(variantesDoTelefone('551199999999')).toEqual(['551199999999', '5511999999999']);
    expect(variantesDoTelefone('551133334444')).toEqual(['551133334444']);
    expect(variantesDoTelefone('14155552671')).toEqual(['14155552671']);
  });
});
