'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSponsorshipStore } from '@/features/sponsorship/useSponsorshipStore';
import { getCourtsFromSupabase } from '@/services/court.service';
import { CLUB_TARGET_ID, FACILITY_AREAS, PLACEMENT_OPTIONS, PRICING_TYPE_LABELS } from '@/lib/sponsorship-data';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  HandshakeIcon,
  ArrowLeft,
  CheckCircle2,
  Plus,
  X,
  Building2,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { SponsorshipTargetType, SponsorshipPricingType, Court } from '@/types';

type FormStep = 'form' | 'success';

export default function BecomeASponsorPage() {
  const createRequest = useSponsorshipStore((s) => s.createRequest);

  const [step, setStep] = useState<FormStep>('form');
  const [submitting, setSubmitting] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);

  useEffect(() => {
    getCourtsFromSupabase().then((data) => setCourts(data));
  }, []);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [targetType, setTargetType] = useState<SponsorshipTargetType>('Club');
  const [targetId, setTargetId] = useState<string>(CLUB_TARGET_ID);
  const [proposedAmount, setProposedAmount] = useState('');
  const [pricingType, setPricingType] = useState<SponsorshipPricingType>('PerMonth');
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([]);
  const [benefitInput, setBenefitInput] = useState('');
  const [requestedBenefits, setRequestedBenefits] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  // When target type changes, reset targetId to its default
  const handleTargetTypeChange = (type: SponsorshipTargetType) => {
    setTargetType(type);
    if (type === 'Club') setTargetId(CLUB_TARGET_ID);
    else if (type === 'Court') setTargetId(courts[0]?.id ?? '');
    else if (type === 'FacilityArea') setTargetId(FACILITY_AREAS[0] ?? '');
  };

  const togglePlacement = (placement: string) => {
    setSelectedPlacements((prev) =>
      prev.includes(placement) ? prev.filter((p) => p !== placement) : [...prev, placement]
    );
  };

  const addBenefit = () => {
    const trimmed = benefitInput.trim();
    if (!trimmed) return;
    if (requestedBenefits.includes(trimmed)) {
      setBenefitInput('');
      return;
    }
    setRequestedBenefits((prev) => [...prev, trimmed]);
    setBenefitInput('');
  };

  const removeBenefit = (benefit: string) => {
    setRequestedBenefits((prev) => prev.filter((b) => b !== benefit));
  };

  const handleBenefitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBenefit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(proposedAmount);

    // Client-side pre-check before hitting the service (mirrors auth register pattern)
    if (!companyName.trim()) { toast.error('Company name is required.'); return; }
    if (!contactName.trim()) { toast.error('Contact name is required.'); return; }
    if (!email.trim()) { toast.error('Email address is required.'); return; }
    if (!phone.trim()) { toast.error('Phone number is required.'); return; }
    if (!proposedAmount || isNaN(amount) || amount <= 0) {
      toast.error('Proposed amount must be a positive number.');
      return;
    }

    setSubmitting(true);

    const result = await createRequest({
      companyName,
      contactName,
      email,
      phone,
      targetType,
      targetId,
      proposedAmount: amount,
      currency: 'EGP',
      pricingType,
      requestedBenefits,
      requestedPlacement: selectedPlacements,
      message,
    });

    setSubmitting(false);

    if (!result.success) {
      // Service-layer error — shown as toast for clear feedback
      toast.error(result.error || 'Failed to submit request. Please try again.');
      return;
    }

    // Success — move to confirmation state
    setStep('success');
  };

  // ── Success screen ──
  if (step === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-3xl bg-green-50 border border-green-200 flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-gray-900">Request Submitted!</h1>
            <p className="text-muted leading-relaxed max-w-md mx-auto">
              Thank you, <strong>{contactName}</strong>. Your sponsorship request from{' '}
              <strong>{companyName}</strong> has been received and is now{' '}
              <span className="text-amber-600 font-bold">Pending review</span>. Our team will
              reach out to you at <strong>{email}</strong>.
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Target</span>
              <span className="font-semibold text-gray-900">
                {targetType === 'Club'
                  ? 'K-HUB Club (Club-wide)'
                  : targetType === 'Court'
                   ? courts.find((c) => c.id === targetId)?.name ?? targetId
                  : targetId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Proposed Amount</span>
              <span className="font-semibold text-gray-900">
                {Number(proposedAmount).toLocaleString()} EGP{' '}
                <span className="text-muted font-normal">
                  / {PRICING_TYPE_LABELS[pricingType]}
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Status</span>
              <span className="font-bold text-amber-600">Pending</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sponsors">
              <Button variant="secondary" size="lg" className="gap-2 w-full sm:w-auto">
                <ArrowLeft className="icon-btn" />
                Back to Sponsors
              </Button>
            </Link>
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => {
                // Reset form for another submission
                setStep('form');
                setCompanyName(''); setContactName(''); setEmail(''); setPhone('');
                setTargetType('Club'); setTargetId(CLUB_TARGET_ID);
                setProposedAmount(''); setPricingType('PerMonth');
                setSelectedPlacements([]); setRequestedBenefits([]); setMessage('');
              }}
            >
              Submit Another Request
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ──
  return (
    <div>
      {/* Hero */}
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-12">
        <SiteContainer>
          <div className="page-hero-inner page-hero-inner--center">
            <div className="flex justify-center">
              <Badge icon={<HandshakeIcon className="icon-inline text-green-600" />} size="sm">
                Partnership Enquiry
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">
              Become a K-HUB Sponsor
            </h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
              Fill in the form below to submit a sponsorship enquiry. Our team will review your
              proposal and get back to you within 3–5 business days.
            </p>
            <Link href="/sponsors" className="inline-flex items-center gap-1.5 text-sm text-green-700 font-semibold hover:underline mt-2">
              <ArrowLeft className="icon-inline" />
              Back to Sponsors
            </Link>
          </div>
        </SiteContainer>
      </section>

      {/* Form */}
      <SiteContainer as="section" className="py-8 sm:py-14">
        <div className="max-w-2xl mx-auto">
          <form
            id="sponsor-apply-form"
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-3xl shadow-sm p-5 sm:p-8 space-y-6 sm:space-y-8"
            noValidate
          >
            {/* ── Contact Details ── */}
            <fieldset className="space-y-5">
              <legend className="text-base font-black text-gray-900 flex items-center gap-2 pb-1 border-b border-gray-100 w-full">
                <Building2 className="icon-feature text-green-600" />
                Company &amp; Contact Details
              </legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-company-name" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Company Name *
                  </label>
                  <input
                    id="sponsor-company-name"
                    type="text"
                    required
                    placeholder="e.g. Acme Sports Ltd."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full khub-input"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-contact-name" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Contact Name *
                  </label>
                  <input
                    id="sponsor-contact-name"
                    type="text"
                    required
                    placeholder="e.g. Ahmed Hassan"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full khub-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-email" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Email Address *
                  </label>
                  <input
                    id="sponsor-email"
                    type="email"
                    required
                    placeholder="contact@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full khub-input"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-phone" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Phone Number *
                  </label>
                  <input
                    id="sponsor-phone"
                    type="tel"
                    required
                    placeholder="+20 100 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full khub-input"
                  />
                </div>
              </div>
            </fieldset>

            {/* ── Sponsorship Target ── */}
            <fieldset className="space-y-5">
              <legend className="text-base font-black text-gray-900 flex items-center gap-2 pb-1 border-b border-gray-100 w-full">
                <Target className="icon-feature text-green-600" />
                Sponsorship Target
              </legend>

              {/* Target type selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  What would you like to sponsor? *
                </label>
                <div className="filter-chip-group flex-wrap gap-1" role="radiogroup" aria-label="Sponsorship target type">
                  {(['Club', 'Court', 'FacilityArea'] as SponsorshipTargetType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={targetType === type}
                      id={`target-type-${type.toLowerCase()}`}
                      onClick={() => handleTargetTypeChange(type)}
                      className={`filter-chip ${targetType === type ? 'filter-chip-active' : ''}`}
                    >
                      {type === 'FacilityArea' ? 'Facility Area' : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dependent picker */}
              {targetType === 'Court' && (
                <div>
                  <label htmlFor="sponsor-court-id" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Select Court *
                  </label>
                  <select
                    id="sponsor-court-id"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full khub-input"
                  >
                    {courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name} ({court.sportType})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'FacilityArea' && (
                <div>
                  <label htmlFor="sponsor-area-id" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Select Facility Area *
                  </label>
                  <select
                    id="sponsor-area-id"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full khub-input"
                  >
                    {FACILITY_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'Club' && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
                  Club-wide sponsorship covers the entire K-HUB brand, all courts, and all
                  facilities.
                </div>
              )}
            </fieldset>

            {/* ── Budget & Pricing ── */}
            <fieldset className="space-y-5">
              <legend className="text-base font-black text-gray-900 pb-1 border-b border-gray-100 w-full">
                Proposed Budget
              </legend>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-amount" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Proposed Amount (EGP) *
                  </label>
                  <input
                    id="sponsor-amount"
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="e.g. 15000"
                    value={proposedAmount}
                    onChange={(e) => setProposedAmount(e.target.value)}
                    className="w-full khub-input"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-pricing-type" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                    Pricing Type *
                  </label>
                  <select
                    id="sponsor-pricing-type"
                    value={pricingType}
                    onChange={(e) => setPricingType(e.target.value as SponsorshipPricingType)}
                    className="w-full khub-input"
                  >
                    {(Object.entries(PRICING_TYPE_LABELS) as [SponsorshipPricingType, string][]).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {proposedAmount && !isNaN(parseFloat(proposedAmount)) && parseFloat(proposedAmount) > 0 && (
                <p className="text-xs text-muted">
                  Your proposal:{' '}
                  <strong className="text-gray-900">
                    {Number(proposedAmount).toLocaleString()} EGP
                  </strong>{' '}
                  {PRICING_TYPE_LABELS[pricingType]?.toLowerCase()}
                </p>
              )}
            </fieldset>

            {/* ── Requested Benefits ── */}
            <fieldset className="space-y-4">
              <legend className="text-base font-black text-gray-900 pb-1 border-b border-gray-100 w-full">
                Requested Benefits{' '}
                <span className="text-xs font-normal text-muted">(optional)</span>
              </legend>
              <p className="text-xs text-muted">
                List what your company is looking for — e.g. &ldquo;Logo on website&rdquo;,
                &ldquo;Court naming rights&rdquo;. These are stored for our team to review.
              </p>

              <div className="flex gap-2">
                <input
                  id="sponsor-benefit-input"
                  type="text"
                  placeholder="Type a benefit and press Enter or Add"
                  value={benefitInput}
                  onChange={(e) => setBenefitInput(e.target.value)}
                  onKeyDown={handleBenefitKeyDown}
                  className="flex-1 khub-input"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addBenefit}
                  className="shrink-0 gap-1"
                >
                  <Plus className="icon-inline" />
                  Add
                </Button>
              </div>

              {requestedBenefits.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {requestedBenefits.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-xs font-semibold text-green-800"
                    >
                      {b}
                      <button
                        type="button"
                        onClick={() => removeBenefit(b)}
                        aria-label={`Remove benefit: ${b}`}
                        className="hover:text-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </fieldset>

            {/* ── Requested Placement ── */}
            <fieldset className="space-y-4">
              <legend className="text-base font-black text-gray-900 pb-1 border-b border-gray-100 w-full">
                Placement Preferences{' '}
                <span className="text-xs font-normal text-muted">(optional)</span>
              </legend>
              <p className="text-xs text-muted">
                Where would you like your brand to be visible? Select all that apply.
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Placement preferences">
                {PLACEMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="checkbox"
                    aria-checked={selectedPlacements.includes(opt)}
                    id={`placement-${opt.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => togglePlacement(opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      selectedPlacements.includes(opt)
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:text-green-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* ── Optional message ── */}
            <div>
              <label htmlFor="sponsor-message" className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                Additional Message{' '}
                <span className="text-xs font-normal normal-case text-muted">(optional)</span>
              </label>
              <textarea
                id="sponsor-message"
                placeholder="Tell us more about your company, goals, or any specific requirements..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full khub-input"
              />
            </div>

            {/* Submit */}
            <Button
              id="sponsor-submit-btn"
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              <HandshakeIcon className="icon-btn" />
              {submitting ? 'Submitting...' : 'Submit Sponsorship Request'}
            </Button>

            <p className="text-center text-xs text-muted">
              Your request will be reviewed by our team and stored as{' '}
              <strong>Pending</strong> until approved.
            </p>
          </form>
        </div>
      </SiteContainer>
    </div>
  );
}
