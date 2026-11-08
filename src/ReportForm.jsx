import { useId, useState } from 'react';
import { fetchJson } from './api.js';

export default function ReportForm({ room, onReported }) {
  const id = useId();
  const [kind, setKind] = useState('percent');
  const [occupancy, setOccupancy] = useState('');
  const [noise, setNoise] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (status === 'saving' || status === 'saved') return;
    setStatus('saving');
    setMessage('');
    try {
      const body = { room_id: room.room_id };
      if (occupancy !== '') body[kind === 'percent' ? 'occupancy_percent' : 'people_count'] = Number(occupancy);
      if (noise) body.noise_band = noise;
      const result = await fetchJson('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setStatus('saved');
      setMessage(result.message);
      onReported?.();
    } catch (error) {
      setStatus('error');
      setMessage(error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : error.message);
    }
  }
  return (
    <form className="report-form" onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>What’s it like right now?</h3>
      <p>At this space? Share what you can see or hear. Either field is optional.</p>
      <div className={`report-fields ${kind === 'percent' ? 'report-fields-percent' : ''}`}>
        <fieldset className="report-choice-field" disabled={status === 'saving' || status === 'saved'}>
          <legend>Occupancy format</legend>
          <div className="report-choices">
            {[['percent', 'Approximate % full'], ['count', 'Number of people']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => {
                if (kind !== value) { setKind(value); setOccupancy(''); }
              }}>{label}</button>
            ))}
          </div>
        </fieldset>
        {kind === 'percent' ? (
          <fieldset className="report-choice-field report-percent-field" disabled={status === 'saving' || status === 'saved'}>
            <legend>Approximate fullness (%)</legend>
            <div className="report-choices report-percent-choices">
              {['', ...Array.from({ length: 11 }, (_, index) => String(index * 10))].map(value => (
                <button key={value} type="button" aria-pressed={occupancy === value} onClick={() => setOccupancy(value)}>{value === '' ? 'Skip' : `${value}%`}</button>
              ))}
            </div>
          </fieldset>
        ) : (
          <label htmlFor={`${id}-occupancy`}>People counted
            <input id={`${id}-occupancy`} type="number" inputMode="numeric" min="0" max="10000" step="1" placeholder="Leave blank to skip" value={occupancy} onChange={event => setOccupancy(event.target.value)} disabled={status === 'saving' || status === 'saved'} />
          </label>
        )}
        <fieldset className="report-choice-field report-noise-field" disabled={status === 'saving' || status === 'saved'}>
          <legend>Noise level</legend>
          <div className="report-choices report-noise-choices">
            {[['', 'Skip'], ['quiet', 'Quiet'], ['moderate', 'Moderate'], ['lively', 'Lively']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={noise === value} onClick={() => setNoise(value)}>{label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <button className="secondary-button" type="submit" disabled={status === 'saving' || status === 'saved' || (occupancy === '' && !noise)}>
        {status === 'saving' ? 'Sending observation…' : status === 'saved' ? 'Observation received' : 'Share observation'}
      </button>
      {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
      <p className="report-help">One observation can help update the estimate. Reports count for 15 minutes; we limit repeat submissions and filter unusual values. Noise ratings are impressions, not decibel measurements.</p>
    </form>
  );
}
