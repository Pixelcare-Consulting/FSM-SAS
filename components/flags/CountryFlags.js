import React from 'react';

export const SGFlag = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.35 18.9" style={{ width: '16px', height: '11px' }}>
    <rect width="28.35" height="9.45" fill="#EF3340"/>
    <rect y="9.45" width="28.35" height="9.45" fill="#fff"/>
    <circle cx="7.087" cy="9.45" r="5.67" fill="#fff"/>
    <path d="M7.087,5.67l1.147,3.531h3.712L8.959,11.142l1.147,3.531L7.087,13.23L4.069,14.673l1.147-3.531L2.228,9.201h3.712Z" fill="#EF3340"/>
  </svg>
);

export const GBFlag = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" style={{ width: '16px', height: '11px' }}>
    <clipPath id="t">
      <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/>
    </clipPath>
    <path d="M0,0 v30 h60 v-30 z" fill="#00247d"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
    <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#cf142b" strokeWidth="4"/>
    <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
    <path d="M30,0 v30 M0,15 h60" stroke="#cf142b" strokeWidth="6"/>
  </svg>
);

export const USFlag = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 100" style={{ width: '16px', height: '11px' }}>
    <rect width="190" height="100" fill="#bf0a30"/>
    <rect y="7.69" width="190" height="7.69" fill="#fff"/>
    <rect y="23.08" width="190" height="7.69" fill="#fff"/>
    <rect y="38.46" width="190" height="7.69" fill="#fff"/>
    <rect y="53.85" width="190" height="7.69" fill="#fff"/>
    <rect y="69.23" width="190" height="7.69" fill="#fff"/>
    <rect y="84.62" width="190" height="7.69" fill="#fff"/>
    <rect width="76" height="53.85" fill="#002868"/>
    <g fill="#fff">
      {[...Array(9)].map((_, i) =>
        [...Array(11)].map((_, j) => (
          <circle key={`star-${i}-${j}`} cx={3.8 + j * 7.6} cy={3.8 + i * 5.38} r="2"/>
        ))
      )}
    </g>
  </svg>
);

export const CustomCountryFlag = ({ country }) => {
  switch (country) {
    case 'SG':
      return <SGFlag />;
    case 'GB':
      return <GBFlag />;
    case 'US':
      return <USFlag />;
    default:
      return null;
  }
}; 