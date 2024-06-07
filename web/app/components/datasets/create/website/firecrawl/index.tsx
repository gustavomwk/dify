'use client'
import type { FC } from 'react'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import cn from 'classnames'
import Header from './header'
import UrlInput from './base/url-input'
import OptionsWrap from './base/options-wrap'
import Options from './options'
import CrawledResult from './crawled-result'
import Crawling from './crawling'
import { useModalContext } from '@/context/modal-context'
import type { CrawlOptions, CrawlResultItem } from '@/models/datasets'
import Toast from '@/app/components/base/toast'
import { checkFirecrawlTaskStatus, createFirecrawlTask } from '@/service/datasets'
import { sleep } from '@/utils'

const ERROR_I18N_PREFIX = 'common.errorMsg'
const I18N_PREFIX = 'datasetCreation.stepOne.website'

type Props = {
  onPreview: (payload: CrawlResultItem) => void
  checkedCrawlResult: CrawlResultItem[]
  onCheckedCrawlResultChange: (payload: CrawlResultItem[]) => void
  onJobIdChange: (jobId: string) => void
  crawlOptions: CrawlOptions
  onCrawlOptionsChange: (payload: CrawlOptions) => void
}

enum Step {
  init = 'init',
  running = 'running',
  finished = 'finished',
}

const FireCrawl: FC<Props> = ({
  onPreview,
  checkedCrawlResult,
  onCheckedCrawlResultChange,
  onJobIdChange,
  crawlOptions,
  onCrawlOptionsChange,
}) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>(Step.init)
  const { setShowAccountSettingModal } = useModalContext()
  const handleSetting = useCallback(() => {
    setShowAccountSettingModal({
      payload: 'data-source',
    })
  }, [setShowAccountSettingModal])

  const checkValid = useCallback((url: string) => {
    let errorMsg = ''
    if (!url) {
      errorMsg = t(`${ERROR_I18N_PREFIX}.fieldRequired`, {
        field: 'url',
      })
    }

    if (!errorMsg && !((url.startsWith('http://') || url.startsWith('https://'))))
      errorMsg = t(`${ERROR_I18N_PREFIX}.urlError`)

    if (!errorMsg && (crawlOptions.limit === null || crawlOptions.limit === undefined || crawlOptions.limit === '')) {
      errorMsg = t(`${ERROR_I18N_PREFIX}.fieldRequired`, {
        field: t(`${I18N_PREFIX}.limit`),
      })
    }

    if (!errorMsg && (crawlOptions.max_depth === null || crawlOptions.max_depth === undefined || crawlOptions.max_depth === '')) {
      errorMsg = t(`${ERROR_I18N_PREFIX}.fieldRequired`, {
        field: t(`${I18N_PREFIX}.maxDepth`),
      })
    }

    return {
      isValid: !errorMsg,
      errorMsg,
    }
  }, [crawlOptions, t])

  const isInit = step === Step.init
  const isCrawlFinished = step === Step.finished
  const isRunning = step === Step.running
  const [crawlResult, setCrawlResult] = useState<{
    current: number
    total: number
    data: CrawlResultItem[]
  } | undefined>(undefined)
  const [crawlHasError, setCrawlHasError] = useState(false)

  const waitForCrawlFinished = useCallback(async (jobId: string) => {
    try {
      const res = await checkFirecrawlTaskStatus(jobId) as any
      if (res.status === 'completed') {
        return {
          isError: false,
          data: {
            ...res,
            total: Math.min(res.total, parseFloat(crawlOptions.limit as string)),
          },
        }
      }
      if (res.status === 'error' || !res.status) {
        // can't get the error message from the firecrawl api
        return {
          isError: true,
          data: {
            data: [],
          },
        }
      }
      // update the progress
      setCrawlResult({
        ...res,
        total: Math.min(res.total, parseFloat(crawlOptions.limit as string)),
      })
      await sleep(2500)
      return await waitForCrawlFinished(jobId)
    }
    catch (e) {
      return {
        isError: true,
        data: {
          data: [],
        },
      }
    }
  }, [crawlOptions.limit])

  const handleRun = useCallback(async (url: string) => {
    const { isValid, errorMsg } = checkValid(url)
    if (!isValid) {
      Toast.notify({
        message: errorMsg!,
        type: 'error',
      })
      return
    }
    setCrawlHasError(false)
    setStep(Step.running)
    const res = await createFirecrawlTask({
      url,
      options: crawlOptions,
    }) as any
    const jobId = res.job_id
    onJobIdChange(jobId)
    const { isError, data } = await waitForCrawlFinished(jobId)
    if (isError) {
      setCrawlHasError(true)
      setCrawlResult(data)
    }

    setStep(Step.finished)
    setCrawlResult(data)
    setCrawlHasError(false)
  }, [checkValid, crawlOptions, onJobIdChange, waitForCrawlFinished])

  return (
    <div>
      <Header onSetting={handleSetting} />
      <div className={cn(isInit ? 'pb-4' : 'pb-0', 'mt-2 p-3 rounded-xl border border-gray-200')}>
        <UrlInput onRun={handleRun} isRunning={isRunning} />
        <OptionsWrap
          className={cn('mt-3')}
          isFilledFull={!isInit}
          hasError={isCrawlFinished && crawlHasError}
        >
          {isInit && <Options className='mt-2' payload={crawlOptions} onChange={onCrawlOptionsChange} />}
          {isRunning
            && <Crawling
              className='mt-2'
              crawledNum={crawlResult?.current || 0}
              totalNum={crawlResult?.total || parseFloat(crawlOptions.limit as string) || 0}
            />}
          {isCrawlFinished && (
            <CrawledResult
              list={crawlResult?.data || []}
              checkedList={checkedCrawlResult}
              onSelectedChange={onCheckedCrawlResultChange}
              onPreview={onPreview}
            />
          )}
        </OptionsWrap>
      </div>
    </div>
  )
}
export default React.memo(FireCrawl)