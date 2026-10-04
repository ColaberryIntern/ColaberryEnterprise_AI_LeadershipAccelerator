import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovServicesPage from './AdminGovServicesPage';
import * as factoryApi from '../../services/factoryApi';
import type { ServiceOffering } from '../../services/factoryApi';

// No @testing-library here: render via react-dom/client + act and drive the DOM directly.
jest.mock('../../services/factoryApi');

const svc = (over: Partial<ServiceOffering> = {}): ServiceOffering => ({
  id: 's1', name: 'Data Platform', description: 'Dashboards + ETL', category: 'Data',
  keywords: ['dashboards', 'etl'], naicsCodes: ['541512'], pscCodes: [], pastPerformance: null,
  owner: 'ali@colaberry.com', status: 'active', ...over,
});

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><AdminGovServicesPage /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const click = async (el: Element) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
};
const findButton = (text: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
const setField = (id: string, value: string) => {
  const el = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const submitForm = async () => {
  const form = container.querySelector('form')!;
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
};

describe('AdminGovServicesPage — the service catalog', () => {
  it('lists the tenant\'s active services on load', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([svc()]);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Data Platform');
    expect(text).toContain('Data');            // category
    expect(text).toContain('dashboards, etl'); // keywords joined
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledWith('active');
  });

  it('shows an honest empty state when the catalog is empty', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([]);
    await renderPage();
    expect(container.textContent ?? '').toContain('No services yet');
  });

  it('adds a service — submits create with parsed keyword/NAICS arrays, then reloads', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([]);
    (factoryApi.createServiceOffering as jest.Mock).mockResolvedValue(svc({ id: 'new' }));
    await renderPage();
    await click(findButton('Add your first service')!);  // opens the form
    setField('svc-name', 'Cyber Services');
    setField('svc-keywords', 'cybersecurity, soc, incident response');
    setField('svc-naics', '541519');
    await submitForm();
    expect(factoryApi.createServiceOffering).toHaveBeenCalledTimes(1);
    const body = (factoryApi.createServiceOffering as jest.Mock).mock.calls[0][0];
    expect(body).toMatchObject({ name: 'Cyber Services', keywords: ['cybersecurity', 'soc', 'incident response'], naicsCodes: ['541519'] });
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledTimes(2); // initial + reload after save
  });

  it('edits a service — prefills the form and submits update', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([svc()]);
    (factoryApi.updateServiceOffering as jest.Mock).mockResolvedValue(svc({ name: 'Data Platform v2' }));
    await renderPage();
    await click(findButton('Edit')!);
    expect((container.querySelector('#svc-name') as HTMLInputElement).value).toBe('Data Platform'); // prefilled
    setField('svc-name', 'Data Platform v2');
    await submitForm();
    expect(factoryApi.updateServiceOffering).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Data Platform v2' }));
  });

  it('retires a service (calls retire, then reloads)', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([svc()]);
    (factoryApi.retireServiceOffering as jest.Mock).mockResolvedValue(svc({ status: 'retired' }));
    await renderPage();
    await click(findButton('Retire')!);
    expect(factoryApi.retireServiceOffering).toHaveBeenCalledWith('s1');
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledTimes(2);
  });

  it('the All filter re-queries with status=all', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([svc()]);
    await renderPage();
    const allBtn = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'All');
    await click(allBtn!);
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledWith('all');
  });
});
