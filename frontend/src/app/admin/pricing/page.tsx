'use client';

import { useState, useEffect } from 'react';
import { api, PricingConfig, ContractDurationThreshold } from '@/lib/api';

const BAND_LABELS = {
  junior: 'Junior (0–4 yrs)',
  mid: 'Mid (5–8 yrs)',
  senior: 'Senior (9–12 yrs)',
  architect: 'Architect (12+ yrs)',
} as const;

type Band = keyof typeof BAND_LABELS;
const BANDS: Band[] = ['junior', 'mid', 'senior', 'architect'];

export default function AdminPricingPage() {
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getPricingConfig();
        setConfig(res.config);
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load config' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.updatePricingConfig(config, description || undefined);
      setMessage({ type: 'success', text: `Saved as version ${res.version}` });
      setDescription('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const updatePlatformFee = (band: Band, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      platformFees: { ...config.platformFees, [band]: parseFloat(value) || 0 },
    });
  };

  const updateVariableMarkup = (band: Band, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      variableMarkupPct: { ...config.variableMarkupPct, [band]: (parseFloat(value) || 0) / 100 },
    });
  };

  const updateField = (field: keyof PricingConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [field]: parseFloat(value) || 0 });
  };

  const updatePctField = (field: keyof PricingConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [field]: (parseFloat(value) || 0) / 100 });
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Pricing Configuration</h1>
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Pricing Configuration</h1>
        <p className="text-red-600 dark:text-red-400">Failed to load pricing configuration.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Pricing Configuration</h1>

      <div className="space-y-8 max-w-3xl">
        {/* Platform Fees */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Platform Fees (INR/month)</h2>
          <div className="grid grid-cols-2 gap-4">
            {BANDS.map((band) => (
              <div key={band}>
                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">{BAND_LABELS[band]}</label>
                <input
                  type="number"
                  min={0}
                  value={config.platformFees[band]}
                  onChange={(e) => updatePlatformFee(band, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Variable Markup */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Variable Markup (%)</h2>
          <div className="grid grid-cols-2 gap-4">
            {BANDS.map((band) => (
              <div key={band}>
                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">{BAND_LABELS[band]}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Math.round(config.variableMarkupPct[band] * 100 * 10) / 10}
                  onChange={(e) => updateVariableMarkup(band, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Contribution Thresholds */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Contribution Thresholds (INR/month)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Minimum</label>
              <input
                type="number"
                min={0}
                value={config.minContributionPerMonth}
                onChange={(e) => updateField('minContributionPerMonth', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Ideal</label>
              <input
                type="number"
                min={0}
                value={config.idealContributionPerMonth}
                onChange={(e) => updateField('idealContributionPerMonth', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </section>

        {/* Financial Parameters */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Financial Parameters</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Cost of Capital (%/year)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Math.round(config.costOfCapitalPctAnnual * 100 * 10) / 10}
                onChange={(e) => updatePctField('costOfCapitalPctAnnual', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Negotiation Buffer (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Math.round(config.negotiationBufferPct * 100 * 10) / 10}
                onChange={(e) => updatePctField('negotiationBufferPct', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Annual Recruiter Cost (INR)</label>
              <input
                type="number"
                min={0}
                value={config.annualRecruiterCost}
                onChange={(e) => updateField('annualRecruiterCost', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </section>

        {/* Budget Optimization */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Budget Optimization</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Max Cost Multiplier</label>
              <input
                type="number"
                min={1}
                step={0.05}
                value={config.maxCostMultiplierThreshold}
                onChange={(e) => updateField('maxCostMultiplierThreshold', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Max Contribution Cap (INR/month)</label>
              <input
                type="number"
                min={0}
                value={config.maxContributionCapPerMonth}
                onChange={(e) => updateField('maxContributionCapPerMonth', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Budget Ceiling Buffer (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Math.round(config.budgetCeilingBufferPct * 100 * 10) / 10}
                onChange={(e) => updatePctField('budgetCeilingBufferPct', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </section>

        {/* Contract Duration Discount */}
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Contract Duration Discounts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Platform fee discounts for longer contract engagements. Does not apply to full-time regular.
          </p>
          <div className="space-y-3">
            {(config.contractDurationDiscount?.thresholds || []).map((tier, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Min Months</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tier.minMonths}
                    onChange={(e) => {
                      const thresholds = [...(config.contractDurationDiscount?.thresholds || [])];
                      thresholds[idx] = { ...thresholds[idx], minMonths: parseInt(e.target.value) || 1 };
                      setConfig({ ...config, contractDurationDiscount: { thresholds } });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Max Months</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={tier.maxMonths}
                    onChange={(e) => {
                      const thresholds = [...(config.contractDurationDiscount?.thresholds || [])];
                      thresholds[idx] = { ...thresholds[idx], maxMonths: parseInt(e.target.value) || 1 };
                      setConfig({ ...config, contractDurationDiscount: { thresholds } });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={Math.round(tier.discountPct * 100 * 10) / 10}
                    onChange={(e) => {
                      const thresholds = [...(config.contractDurationDiscount?.thresholds || [])];
                      thresholds[idx] = { ...thresholds[idx], discountPct: (parseFloat(e.target.value) || 0) / 100 };
                      setConfig({ ...config, contractDurationDiscount: { thresholds } });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <button
                    onClick={() => {
                      const thresholds = (config.contractDurationDiscount?.thresholds || []).filter((_, i) => i !== idx);
                      setConfig({ ...config, contractDurationDiscount: { thresholds } });
                    }}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => {
                const thresholds = [...(config.contractDurationDiscount?.thresholds || [])];
                const lastMax = thresholds.length > 0 ? thresholds[thresholds.length - 1].maxMonths + 1 : 1;
                thresholds.push({ minMonths: lastMax, maxMonths: lastMax + 11, discountPct: 0 });
                setConfig({ ...config, contractDurationDiscount: { thresholds } });
              }}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              + Add Tier
            </button>
          </div>
        </section>

        {/* Save */}
        <section className="card p-6">
          <div className="mb-4">
            <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Change Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Updated platform fees for Q2"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          {message && (
            <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {message.text}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
