import { createContext, useContext } from 'react';

/**
 * caseStudyOpener - lets any case-study title on Our Services open that case study in the page's side panel
 * (CaseStudyDrawer) instead of leaving the page. The page provides it; a title rendered outside the page (or in a
 * test without the provider) falls back to a plain link to the review desk.
 */
export type OpenCaseStudy = (id: string) => void;

export const CaseStudyOpenerContext = createContext<OpenCaseStudy | null>(null);

export const useCaseStudyOpener = (): OpenCaseStudy | null => useContext(CaseStudyOpenerContext);
