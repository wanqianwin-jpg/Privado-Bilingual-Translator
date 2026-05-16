// Unit tests for createFloatBall's 'needs-model' state: glyph/state render,
// click routing to onNeedModel (not onTranslate), and no regression to the
// existing 'idle' click → onTranslate path.

const { createFloatBall } = require('../content/floatball.js')

function clickBall() {
  const ball = document.getElementById('bt-floatball')
  ball.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  return ball
}

function resetDom() {
  document.head.replaceChildren()
  document.body.replaceChildren()
}

describe('createFloatBall needs-model state', () => {
  beforeEach(resetDom)

  test("setState('needs-model') 渲染下载图标和 data-state", () => {
    const onTranslate = jest.fn()
    const onNeedModel = jest.fn()
    const api = createFloatBall({ manualMode: true, onTranslate, onNeedModel })

    api.setState('needs-model')
    const ball = document.getElementById('bt-floatball')
    expect(ball.dataset.state).toBe('needs-model')
    expect(ball.textContent).toBe('⬇')
    expect(ball.title).toBe('点击下载离线翻译模型')
  })

  test('CSS 注入 needs-model 琥珀色规则', () => {
    createFloatBall({ manualMode: true, onTranslate: jest.fn(), onNeedModel: jest.fn() })
    const css = document.getElementById('bt-ball-styles').textContent
    expect(css).toContain('[data-state="needs-model"]')
    expect(css).toContain('rgba(245, 158, 11, 0.92)')
  })

  test('needs-model 状态点击调用 onNeedModel 而非 onTranslate', () => {
    const onTranslate = jest.fn()
    const onNeedModel = jest.fn()
    const api = createFloatBall({ manualMode: true, onTranslate, onNeedModel })

    api.setState('needs-model')
    clickBall()

    expect(onNeedModel).toHaveBeenCalledTimes(1)
    expect(onTranslate).not.toHaveBeenCalled()
  })

  test('回到 idle 后点击仍调用 onTranslate（无回归）', () => {
    const onTranslate = jest.fn()
    const onNeedModel = jest.fn()
    const api = createFloatBall({ manualMode: true, onTranslate, onNeedModel })

    api.setState('needs-model')
    clickBall()
    expect(onNeedModel).toHaveBeenCalledTimes(1)

    api.setState('idle')
    clickBall()
    expect(onTranslate).toHaveBeenCalledTimes(1)
    expect(onNeedModel).toHaveBeenCalledTimes(1)
  })
})
