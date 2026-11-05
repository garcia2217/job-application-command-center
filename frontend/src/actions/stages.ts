'use server'

import { revalidatePath } from 'next/cache'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { stagePayload } from '@/lib/payload'
import { requireSession } from '@/lib/session'
import type { Direction } from '@/lib/stages'
import type { StageCreate, StageUpdate } from '@/lib/types'
import { stageSchema } from '@/lib/validation'
import { apiErrorState, formValues, type FormState } from './form-state'

const SAVE_FAILED = 'Could not save the stage. Try again.'

// Stage changes are activity: they can clear a quiet flag, so the layout scope
// refreshes home, the lists and the nav's quiet badge as well as this page (AC-04.4).
function revalidateActivity() {
  revalidatePath('/', 'layout')
}

// A 404 means the stage (or its application) is already gone; the refresh shows that.
function ignoreNotFound(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 404) throw error
}

export async function createStage(appId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = stageSchema.safeParse(stagePayload(values, 'create'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    // stagePayload('create') always sets name, and zod has checked it isn't blank
    await api.stages.create(appId, parsed.data as StageCreate)
  } catch (error) {
    return apiErrorState(error, values, SAVE_FAILED)
  }

  revalidateActivity()
  // no values: React resets the form after the action and it comes back empty
  return { ok: true }
}

export async function updateStage(
  appId: number,
  stageId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = stageSchema.safeParse(stagePayload(values, 'update'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    await api.stages.update(appId, stageId, parsed.data as StageUpdate)
  } catch (error) {
    return apiErrorState(error, values, SAVE_FAILED)
  }

  revalidateActivity()
  return { ok: true }
}

export async function deleteStage(appId: number, stageId: number): Promise<void> {
  await requireSession()
  try {
    await api.stages.remove(appId, stageId)
  } catch (error) {
    ignoreNotFound(error)
  }
  revalidateActivity()
}

export async function moveStage(appId: number, stageId: number, direction: Direction): Promise<void> {
  await requireSession()
  // a public endpoint: never forward anything but the two directions
  if (direction !== 'up' && direction !== 'down') return
  try {
    await api.stages.move(appId, stageId, direction)
  } catch (error) {
    ignoreNotFound(error)
  }
  revalidateActivity()
}
