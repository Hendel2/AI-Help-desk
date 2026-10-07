import { describe, expect, it } from 'vitest'

import { formatDuration, formatRelative } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [59, '00:00'],
    [92 * 60, '01:32'],
    [-(4 * 3600 + 21 * 60), '04:21'],
    [2 * 86_400 + 4 * 3600, '2d 4h'],
  ])('%i segundos -> %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-10-07T12:00:00Z')

  it('descreve tempos passados em pt-BR', () => {
    expect(formatRelative('2026-10-07T11:55:00Z', now)).toBe('há 5 minutos')
    expect(formatRelative('2026-10-07T09:00:00Z', now)).toBe('há 3 horas')
    expect(formatRelative('2026-10-06T12:00:00Z', now)).toBe('ontem')
  })
})
