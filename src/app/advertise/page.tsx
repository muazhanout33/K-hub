'use client';

import { useState } from 'react';
import { useAdvertisementStore } from '@/features/advertisement/useAdvertisementStore';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  Megaphone,
  MapPin,
  Ruler,
  BadgeDollarSign,
  CheckCircle2,
  ArrowRight,
  X,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdvertisingSpace } from '@/types';

interface RequestFormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  startDate: string;
  endDate: string;
  proposedBudget: string;
  bannerReference: string;
  notes: string;
}

const EMPTY_FORM: RequestFormState = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  startDate: '',
  endDate: '',
  proposedBudget: '',
  bannerReference: '',
  notes: '',
};

/** Today's date in YYYY-MM-DD, used as the minimum for start date pickers. */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export default function AdvertisePage() {
  const getAvailableSpaces = useAdvertisementStore((s) => s.getAvailableSpaces);
  const createRequest = useAdvertisementStore((s) => s.createRequest);

  const availableSpaces = getAvailableSpaces();

  /** The space whose request form is currently open, or null if none. */
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [form, setForm] = useState<RequestFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  /** ID of the most recently successfully submitted space, for success state. */
  const [successSpaceId, setSuccessSpaceId] = useState<string | null>(null);

  const activeSpace = availableSpaces.find((s) => s.id === activeSpaceId) ?? null;

  const openForm = (space: AdvertisingSpace) => {
    setActiveSpaceId(space.id);
    setSuccessSpaceId(null);
    setForm(EMPTY_FORM);
  };

  const closeForm = () => {
    setActiveSpaceId(null);
    setSuccessSpaceId(null);
    setForm(EMPTY_FORM);
  };

  const updateField = (field: keyof RequestFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSpaceId) return;

    const budget = parseFloat(form.proposedBudget);

    // Client-side pre-check before service (mirrors register pattern)
    if (!form.companyName.trim()) { toast.error('Company name is required.'); return; }
    if (!form.contactName.trim()) { toast.error('Contact name is required.'); return; }
    if (!form.email.trim()) { toast.error('Email address is required.'); return; }
    if (!form.phone.trim()) { toast.error('Phone number is required.'); return; }
    if (!form.startDate) { toast.error('Start date is required.'); return; }
    if (!form.endDate) { toast.error('End date is required.'); return; }
    if (form.endDate <= form.startDate) { toast.error('End date must be after start date.'); return; }
    if (!form.proposedBudget || isNaN(budget) || budget <= 0) {
      toast.error('Proposed budget must be a positive number.');
      return;
    }

    setSubmitting(true);

    const result = createRequest({
      companyName: form.companyName,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      advertisingSpaceId: activeSpaceId,
      startDate: form.startDate,
      endDate: form.endDate,
      proposedBudget: budget,
      bannerReference: form.bannerReference || undefined,
      notes: form.notes || undefined,
    });

    setSubmitting(false);

    if (!result.success) {
      // Show the specific service-layer error (overlap, invalid dates, etc.)
      toast.error(result.error || 'Failed to submit request. Please try again.');
      return;
    }

    // Move to success state for this space
    setSuccessSpaceId(activeSpaceId);
    setActiveSpaceId(null);
  };

  const today = todayISO();

  return (
    <div>
      {/* Hero */}
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-12 text-center">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<Megaphone className="icon-inline text-green-600" />} size="sm">
                Advertising at K-HUB
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">
              Available Ad Spaces
            </h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
              Place your brand where active sports enthusiasts see it — on courts, at reception,
              and throughout our facilities. Browse our available advertising spaces below.
            </p>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer as="section" className="py-8 sm:py-14">
        {availableSpaces.length === 0 ? (
          /* ── Empty state ── */
          <div className="max-w-lg mx-auto text-center py-16 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto">
              <Megaphone className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-black text-gray-900">No Spaces Currently Available</h2>
            <p className="text-muted text-sm leading-relaxed">
              All advertising spaces are currently reserved or unavailable. Please check back
              soon, or{' '}
              <a href="/contact" className="text-green-700 font-semibold hover:underline">
                contact us
              </a>{' '}
              to discuss custom advertising options.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* ── Space cards grid ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableSpaces.map((space) => {
                const isFormOpen = activeSpaceId === space.id;
                const isSuccess = successSpaceId === space.id;

                return (
                  <div
                    key={space.id}
                    className={`surface-card p-4 sm:p-6 flex flex-col gap-4 transition-all duration-200 ${
                      isFormOpen ? 'ring-2 ring-green-500 ring-offset-2' : ''
                    }`}
                  >
                    {/* Space info */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-black text-base text-gray-900 leading-snug">
                          {space.name}
                        </h3>
                        <span className="shrink-0 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                          Available
                        </span>
                      </div>

                      {space.description && (
                        <p className="text-xs text-muted leading-relaxed">{space.description}</p>
                      )}

                      <div className="space-y-1.5 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          <MapPin className="icon-inline text-gray-400 shrink-0" />
                          <span>{space.location}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Ruler className="icon-inline text-gray-400 shrink-0" />
                          <span>{space.dimensions}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <BadgeDollarSign className="icon-inline text-gray-400 shrink-0" />
                          <span>
                            <strong className="text-gray-900 text-sm">
                              {space.basePrice.toLocaleString()} EGP
                            </strong>{' '}
                            / {space.billingPeriod}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Success state for this card */}
                    {isSuccess && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-xs text-green-800 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        Request submitted — our team will contact you.
                      </div>
                    )}

                    {/* CTA */}
                    {!isSuccess && (
                      <Button
                        id={`adspace-request-btn-${space.id}`}
                        variant={isFormOpen ? 'secondary' : 'primary'}
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => (isFormOpen ? closeForm() : openForm(space))}
                      >
                        {isFormOpen ? (
                          <>
                            <X className="icon-inline" />
                            Cancel
                          </>
                        ) : (
                          <>
                            Request This Space
                            <ArrowRight className="icon-inline" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Inline request form (appears below the grid when a space is selected) ── */}
            {activeSpace && (
              <div
                id="ad-request-form-section"
                className="max-w-2xl mx-auto scroll-mt-24"
              >
                <div className="bg-white border-2 border-green-200 rounded-3xl shadow-sm overflow-hidden">
                  {/* Form header */}
                  <div className="bg-green-50 border-b border-green-100 px-5 sm:px-8 py-4 sm:py-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-0.5">
                        Requesting Ad Space
                      </p>
                      <h2 className="text-lg font-black text-gray-900">{activeSpace.name}</h2>
                      <p className="text-xs text-muted mt-0.5">{activeSpace.location} · {activeSpace.dimensions}</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeForm}
                      aria-label="Close request form"
                      className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white transition-colors shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form
                    id="ad-request-form"
                    onSubmit={handleSubmit}
                    className="p-5 sm:p-8 space-y-5 sm:space-y-6"
                    noValidate
                  >
                    {/* Contact */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="ad-company-name" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                          Company Name *
                        </label>
                        <input
                          id="ad-company-name"
                          type="text"
                          required
                          placeholder="e.g. Acme Sports Ltd."
                          value={form.companyName}
                          onChange={updateField('companyName')}
                          className="w-full khub-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="ad-contact-name" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                          Contact Name *
                        </label>
                        <input
                          id="ad-contact-name"
                          type="text"
                          required
                          placeholder="e.g. Sara Mohamed"
                          value={form.contactName}
                          onChange={updateField('contactName')}
                          className="w-full khub-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="ad-email" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                          Email *
                        </label>
                        <input
                          id="ad-email"
                          type="email"
                          required
                          placeholder="contact@company.com"
                          value={form.email}
                          onChange={updateField('email')}
                          className="w-full khub-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="ad-phone" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                          Phone *
                        </label>
                        <input
                          id="ad-phone"
                          type="tel"
                          required
                          placeholder="+20 100 000 0000"
                          value={form.phone}
                          onChange={updateField('phone')}
                          className="w-full khub-input"
                        />
                      </div>
                    </div>

                    {/* Dates */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <label className="text-xs font-bold text-gray-700 uppercase">
                          Campaign Dates *
                        </label>
                        <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          No overlap with existing requests
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="ad-start-date" className="block text-xs text-muted mb-1">
                            Start Date
                          </label>
                          <input
                            id="ad-start-date"
                            type="date"
                            required
                            min={today}
                            value={form.startDate}
                            onChange={updateField('startDate')}
                            className="w-full khub-input"
                          />
                        </div>
                        <div>
                          <label htmlFor="ad-end-date" className="block text-xs text-muted mb-1">
                            End Date
                          </label>
                          <input
                            id="ad-end-date"
                            type="date"
                            required
                            min={form.startDate || today}
                            value={form.endDate}
                            onChange={updateField('endDate')}
                            className="w-full khub-input"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Budget */}
                    <div>
                      <label htmlFor="ad-budget" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                        Proposed Budget (EGP) *
                      </label>
                      <input
                        id="ad-budget"
                        type="number"
                        required
                        min="1"
                        step="any"
                        placeholder={`Base price: ${activeSpace.basePrice.toLocaleString()} EGP / ${activeSpace.billingPeriod}`}
                        value={form.proposedBudget}
                        onChange={updateField('proposedBudget')}
                        className="w-full khub-input"
                      />
                      <p className="text-xs text-muted mt-1">
                        Space base rate: {activeSpace.basePrice.toLocaleString()} EGP /{' '}
                        {activeSpace.billingPeriod}
                      </p>
                    </div>

                    {/* Optional fields */}
                    <div>
                      <label htmlFor="ad-banner-ref" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                        Banner / Creative Reference{' '}
                        <span className="text-xs font-normal normal-case text-muted">(URL or description — optional)</span>
                      </label>
                      <input
                        id="ad-banner-ref"
                        type="text"
                        placeholder="e.g. https://assets.company.com/banner.png or describe your creative"
                        value={form.bannerReference}
                        onChange={updateField('bannerReference')}
                        className="w-full khub-input"
                      />
                    </div>

                    <div>
                      <label htmlFor="ad-notes" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                        Notes{' '}
                        <span className="text-xs font-normal normal-case text-muted">(optional)</span>
                      </label>
                      <textarea
                        id="ad-notes"
                        placeholder="Any special requirements, preferences, or questions..."
                        value={form.notes}
                        onChange={updateField('notes')}
                        rows={3}
                        className="w-full khub-input"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button
                        id="ad-submit-btn"
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="flex-1 gap-2"
                        disabled={submitting}
                      >
                        <Megaphone className="icon-btn" />
                        {submitting ? 'Submitting...' : 'Submit Advertisement Request'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={closeForm}
                        className="shrink-0"
                      >
                        Cancel
                      </Button>
                    </div>

                    <p className="text-center text-xs text-muted">
                      Your request will be stored as{' '}
                      <strong>Pending</strong> for team review. Overlap with existing
                      Pending or Approved requests on this space is automatically prevented.
                    </p>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </SiteContainer>
    </div>
  );
}
