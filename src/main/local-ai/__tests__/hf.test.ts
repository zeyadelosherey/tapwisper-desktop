import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ net: {} }))

const { pickFiles } = await import('../hf')

const file = (rfilename: string, sha256 = 'b'.repeat(64)) => ({
  rfilename,
  size: 100,
  lfs: { sha256, size: 100 }
})

const repo = {
  sha: 'c0ffee',
  siblings: [
    { rfilename: '.gitattributes', size: 1 },
    file('Model-Q8_0.gguf'),
    file('Model-Q4_K_M.gguf'),
    file('Model-Q4_K_M-00001-of-00002.gguf'),
    file('mmproj-Model-Q8_0.gguf'),
    file('mmproj-Model-f16.gguf'),
    file('sub/Model-IQ4_XS.gguf')
  ]
}

describe('pickFiles', () => {
  it('takes the first preferred quantization present and pins the commit', () => {
    const [model] = pickFiles({ repo: 'org/Model-GGUF', quant: ['Q5_K_M', 'Q4_K_M'] }, repo)
    expect(model).toEqual({
      role: 'model',
      url: 'https://huggingface.co/org/Model-GGUF/resolve/c0ffee/Model-Q4_K_M.gguf',
      size: 100,
      sha256: 'b'.repeat(64)
    })
  })

  it('never picks split files or projectors as the model', () => {
    const [model] = pickFiles({ repo: 'org/Model-GGUF', quant: ['Q8_0'] }, repo)
    expect(model.url).toMatch(/\/Model-Q8_0\.gguf$/)
  })

  it('finds files in subfolders and escapes them in the URL', () => {
    const [model] = pickFiles({ repo: 'org/Model-GGUF', quant: ['IQ4_XS'] }, repo)
    expect(model.url).toMatch(/\/resolve\/c0ffee\/sub\/Model-IQ4_XS\.gguf$/)
  })

  it('adds the f16 projector for audio models', () => {
    const files = pickFiles({ repo: 'org/Model-GGUF', quant: ['Q8_0'], mmproj: true }, repo)
    expect(files.map((f) => f.role)).toEqual(['model', 'mmproj'])
    expect(files[1].url).toMatch(/mmproj-Model-f16\.gguf$/)
  })

  it('matches exact file names and ignores non-SHA-256 ids', () => {
    const info = { siblings: [{ rfilename: 'ggml-base.bin', size: 5, lfs: { oid: 'xyz' } }] }
    const [model] = pickFiles({ repo: 'ggerganov/whisper.cpp', file: 'ggml-base.bin' }, info)
    expect(model.url).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
    )
    expect(model.sha256).toBeUndefined()
  })

  it('reports a missing file', () => {
    expect(() => pickFiles({ repo: 'org/Model-GGUF', quant: ['Q2_K'] }, repo)).toThrow(
      expect.objectContaining({ code: 'model-unavailable' })
    )
  })
})
