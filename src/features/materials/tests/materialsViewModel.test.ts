import { describe, expect, it } from 'vitest'
import { createPlan } from '../../../shared/models'
import { analyzeLayout } from '../../../shared/layoutRules'
import { createMaterialDraft } from '../materialsViewModel'

describe('materials module', () => {
  it('creates a device draft with catalog dimensions at a position inside the desk', () => {
    const plan = createPlan('test', false)
    const draft = createMaterialDraft('lamp', plan)
    expect(draft.canPlace).toBe(true)
    expect(draft.item?.type).toBe('lamp')
    expect(draft.item?.widthMm).toBe(180)
    expect(draft.item?.x).toBeGreaterThanOrEqual(0)
    expect(draft.item?.y).toBeGreaterThanOrEqual(0)
    expect(draft.item!.x + draft.item!.widthMm).toBeLessThanOrEqual(plan.deskWidthMm)
    expect(draft.item!.y + draft.item!.heightMm).toBeLessThanOrEqual(plan.deskHeightMm)
    expect(draft.feedback).toBe('桌面灯已添加')
  })

  it('places the new device next to existing ones without overlap or out-of-bounds issues', () => {
    let plan = createPlan('test', false)
    for (let added = 0; added < 6; added += 1) {
      const draft = createMaterialDraft('speaker', plan)
      expect(draft.canPlace).toBe(true)
      plan = { ...plan, items: [...plan.items, draft.item!] }
      const analysis = analyzeLayout(plan)
      expect(analysis.overlapIds).toHaveLength(0)
      expect(analysis.outOfBoundsIds).toHaveLength(0)
    }
  })

  it('does not reuse a slot that is occupied again (delete then re-add)', () => {
    let plan = createPlan('test', false)
    const first = createMaterialDraft('speaker', plan)
    plan = { ...plan, items: [first.item!] }
    plan = { ...plan, items: [] }
    const readded = createMaterialDraft('speaker', plan)
    expect(readded.canPlace).toBe(true)
    expect(readded.item).toMatchObject({ x: 20, y: 20 })

    // 老位置被占用时，重新添加必须换到真正空闲的位置。
    const occupied = createMaterialDraft('speaker', createPlan('test', false))
    const blockedPlan = { ...createPlan('test', false), items: [occupied.item!] }
    const another = createMaterialDraft('speaker', blockedPlan)
    expect(another.item).not.toMatchObject({ x: occupied.item!.x, y: occupied.item!.y })
  })

  it('refuses to create a draft when the desk physically cannot fit the device', () => {
    const tinyDesk = { ...createPlan('test', false), deskWidthMm: 200, deskHeightMm: 200 }
    const draft = createMaterialDraft('monitor', tinyDesk)
    expect(draft.canPlace).toBe(false)
    expect(draft.item).toBeNull()
    expect(draft.feedback).toContain('放不下')
  })
})
