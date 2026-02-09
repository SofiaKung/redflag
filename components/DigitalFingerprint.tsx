
import React from 'react';
import {
  Clock,
  Server,
  AlertTriangle,
  Fingerprint,
  CircleAlert,
  MapPin,
  Building2,
  ShieldOff,
  ShieldAlert,
  Mail,
  Phone,
} from 'lucide-react';
import { LinkMetadata } from '../types';

// --- Metadata severity color helper ---
const getMetaSeverity = (field: string, value: string | number): string => {
  if (field === 'domainAge') {
    if (typeof value === 'string' && (value.includes('hour') || value.includes('day') || value.includes('< ')))
      return 'text-red-600';
    if (typeof value === 'string' && value.includes('week')) return 'text-amber-600';
    return 'text-slate-700';
  }
  if (field === 'blacklistCount') {
    if (typeof value === 'number' && value > 0) return 'text-red-600';
    return 'text-emerald-600';
  }
  return 'text-slate-700';
};

interface DigitalFingerprintProps {
  meta: LinkMetadata;
}

const DigitalFingerprint: React.FC<DigitalFingerprintProps> = ({ meta }) => {
  const verified = meta.verified;

  return (
    <>
      {/* Digital Fingerprint Card */}
      <div className="bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
          <Fingerprint size={12} /> Digital Fingerprint
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {/* Domain Age */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-neutral-400">
                <Clock size={12} />
                <span className="text-[9px] uppercase font-black tracking-wider">Domain Age</span>
              </div>
              {!verified?.domainAge && (
                <CircleAlert size={10} className="text-amber-400" />
              )}
            </div>
            <p className={`text-sm font-bold ${getMetaSeverity('domainAge', verified?.domainAge || meta.domainAge)}`}>
              {verified?.domainAge || meta.domainAge}
            </p>
            {verified?.registrationDate && (
              <p className="text-[9px] font-mono text-neutral-400 mt-1">
                Reg: {new Date(verified.registrationDate).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Registrar */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-neutral-400">
                <Building2 size={12} />
                <span className="text-[9px] uppercase font-black tracking-wider">Registrar</span>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {verified?.registrar || 'Unknown'}
            </p>
          </div>

          {/* Server Location */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-neutral-400">
                <Server size={12} />
                <span className="text-[9px] uppercase font-black tracking-wider">Hosted In</span>
              </div>
              {!verified?.serverCountry && (
                <CircleAlert size={10} className="text-amber-400" />
              )}
            </div>
            <p className="text-sm font-bold text-slate-800">
              {verified?.serverCountry
                ? `${verified.serverCountry}${verified.serverCity ? `, ${verified.serverCity}` : ''}`
                : meta.serverLocation}
            </p>
            {verified?.isp && (
              <p className="text-[9px] font-mono text-neutral-400 mt-1 truncate" title={verified.isp}>
                {verified.isp}
              </p>
            )}
          </div>

          {/* Registrant */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-neutral-400">
                <MapPin size={12} />
                <span className="text-[9px] uppercase font-black tracking-wider">Registrant</span>
              </div>
              {!(verified && verified.checksCompleted.includes('whois')) && (
                <CircleAlert size={10} className="text-amber-400" />
              )}
            </div>
            <p className={`text-sm font-bold ${
              verified?.privacyProtected ? 'text-amber-600' : verified?.geoMismatch ? 'text-red-600' : 'text-slate-800'
            }`}>
              {verified?.registrantOrg || verified?.registrantName
                || (verified?.privacyProtected ? 'Privacy Protected' : 'Unknown')}
            </p>
            <p className="text-[9px] font-mono text-neutral-400 mt-1">
              {[verified?.registrantCity, verified?.registrantCountry]
                .filter(Boolean).join(', ') || 'Location unknown'}
            </p>
          </div>

          {/* Contact Email */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <Mail size={12} />
              <span className="text-[9px] uppercase font-black tracking-wider">Contact Email</span>
            </div>
            <p className={`text-sm font-bold break-all leading-snug ${
              verified?.registrantEmail?.includes('withheldforprivacy') || verified?.registrantEmail?.includes('whoisguard')
                ? 'text-amber-600' : 'text-slate-800'
            }`}>
              {verified?.registrantEmail || 'Not available'}
            </p>
          </div>

          {/* Contact Phone */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="flex items-center gap-2 text-neutral-400 mb-2">
              <Phone size={12} />
              <span className="text-[9px] uppercase font-black tracking-wider">Contact Phone</span>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {verified?.registrantTelephone || 'Not available'}
            </p>
          </div>
        </div>

        {/* Verification legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1">
            <CircleAlert size={8} className="text-amber-400" />
            <span className="text-[8px] font-mono text-neutral-400 uppercase">AI Estimate</span>
          </div>
        </div>

        {/* Privacy badge */}
        {verified?.privacyProtected && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-100">
            <ShieldOff size={12} className="text-amber-500 shrink-0" />
            <span className="text-[10px] font-bold text-amber-700">WHOIS Privacy Protected</span>
          </div>
        )}

        {/* Extra verified data: Safe Browsing, Homograph */}
        {verified && (verified.homographAttack || verified.checksCompleted.includes('safe_browsing')) && (
          <div className="mt-3 p-3 rounded-xl bg-neutral-100/50 border border-neutral-100 space-y-1.5">
            {verified.checksCompleted.includes('safe_browsing') && (
              <div className="flex items-center gap-2">
                <ShieldAlert size={10} className={
                  (verified.safeBrowsingThreats?.length || 0) > 0 ? 'text-red-500' : 'text-emerald-500'
                } />
                <span className={`text-[10px] font-mono truncate ${
                  (verified.safeBrowsingThreats?.length || 0) > 0 ? 'text-red-600 font-bold' : 'text-neutral-500'
                }`}>
                  {(verified.safeBrowsingThreats?.length || 0) > 0
                    ? `Safe Browsing: ${verified.safeBrowsingThreats!.join(', ')}`
                    : 'Safe Browsing: No threats'}
                </span>
              </div>
            )}
            {verified.homographAttack && (
              <div className="flex items-center gap-2">
                <AlertTriangle size={10} className="text-red-500" />
                <span className="text-[10px] font-mono text-red-600 font-bold">
                  HOMOGRAPH ATTACK DETECTED (Punycode/Cyrillic)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Geo-Mismatch Alert */}
      {verified?.geoMismatch && verified.geoMismatchDetails.length > 0 && (
        <div className={`border rounded-3xl p-6 shadow-sm ${
          verified.geoMismatchSeverity === 'high'
            ? 'bg-red-50/80 border-red-200'
            : verified.geoMismatchSeverity === 'medium'
              ? 'bg-amber-50/80 border-amber-200'
              : 'bg-yellow-50/80 border-yellow-200'
        }`}>
          <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2 ${
            verified.geoMismatchSeverity === 'high' ? 'text-red-500' : 'text-amber-500'
          }`}>
            <AlertTriangle size={12} />
            Geographic Inconsistency
            <span className={`ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full ${
              verified.geoMismatchSeverity === 'high'
                ? 'bg-red-200 text-red-700'
                : verified.geoMismatchSeverity === 'medium'
                  ? 'bg-amber-200 text-amber-700'
                  : 'bg-yellow-200 text-yellow-700'
            }`}>
              {verified.geoMismatchSeverity.toUpperCase()}
            </span>
          </h4>
          <div className="space-y-2">
            {verified.geoMismatchDetails.map((detail, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  verified.geoMismatchSeverity === 'high' ? 'bg-red-500' : 'bg-amber-500'
                }`} />
                <p className={`text-sm font-bold leading-snug ${
                  verified.geoMismatchSeverity === 'high' ? 'text-red-800' : 'text-amber-800'
                }`}>
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default DigitalFingerprint;
