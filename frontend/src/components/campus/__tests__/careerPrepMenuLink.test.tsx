import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CareerPrepMenuLink, CareerPrepTab, resetCareerPrepMenu } from '../CareerPrepMenuLink';

/** One click into Career Prep from any portal page, only for a student it is on for. */
const mockFlag = jest.fn();
jest.mock('../../careerPrep/careerPrepFlag', () => ({ fetchCareerPrepFlag: () => mockFlag() }));
let mockAudience = 'explorer';
jest.mock('../useCampusView', () => ({ useCampusView: () => ({ audience: mockAudience }) }));
let mockToken = 't1';
jest.mock('../../../utils/participantToken', () => ({ getParticipantToken: () => mockToken }));

let host: HTMLDivElement;
let root: Root;
const mount = async () => { await act(async () => { root.render(<MemoryRouter><CareerPrepMenuLink /><CareerPrepTab /></MemoryRouter>); }); };
const hrefs = () => Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
const remount = async () => { act(() => root.unmount()); root = createRoot(host); await mount(); };

beforeEach(() => {
  resetCareerPrepMenu(); mockFlag.mockReset().mockResolvedValue(true); mockAudience = 'explorer'; mockToken = 't1';
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it.each(['member', 'explorer'])('a %s it is on for gets the menu link and the phone tab, from one request', async (a) => {
  mockAudience = a;
  await mount();
  expect(hrefs()).toEqual(['/portal/career/room', '/portal/career/room']);
  await remount();
  expect(mockFlag).toHaveBeenCalledTimes(1);
});
it('a student it is off for, or a failed check, sees nothing', async () => {
  mockFlag.mockResolvedValue(false);
  await mount();
  expect(hrefs()).toEqual([]);
  resetCareerPrepMenu(); mockFlag.mockRejectedValue(new Error('down'));
  await remount();
  expect(hrefs()).toEqual([]);
});
it.each(['staff', 'business'])('%s is never asked about', async (a) => {
  mockAudience = a;
  await mount();
  expect(hrefs()).toEqual([]);
  expect(mockFlag).not.toHaveBeenCalled();
});
it('another sign-in is asked afresh', async () => {
  await mount();
  mockToken = 't2'; mockFlag.mockResolvedValue(false);
  await remount();
  expect(mockFlag).toHaveBeenCalledTimes(2);
  expect(hrefs()).toEqual([]);
});
