import React from 'react';
import { Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Link from 'next/link';

/**
 * Reusable Dashboard Header Component
 * Blue gradient header used across dashboard pages for consistent design
 * 
 * @param {string} title - Main title text (required)
 * @param {string} subtitle - Subtitle/description text (optional)
 * @param {string} infoText - Information box text (optional)
 * @param {Array} stats - Array of stat badges { icon, label, value, tooltip } (optional)
 * @param {Array} badges - Array of action badges { label, icon, onClick } (optional)
 * @param {Array} breadcrumbs - Array of breadcrumb items { icon, label, href } (optional)
 * @param {React.ReactNode} rightAction - Optional action button/component on the right (optional)
 * @param {boolean} compact - Tighter padding and typography (e.g. jobs list)
 */
const DashboardHeader = ({ 
  title, 
  subtitle, 
  infoText,
  stats = [],
  badges = [],
  breadcrumbs = [],
  rightAction,
  compact = false,
}) => {
  const shell = compact
    ? {
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem',
        borderRadius: '0 0 12px 12px',
        marginTop: 0,
        marginBottom: '8px',
      }
    : {
        paddingTop: '1.5rem',
        paddingBottom: '1.5rem',
        borderRadius: '0 0 24px 24px',
        marginTop: '-25px',
        marginBottom: '20px',
      };

  return (
    <Row>
      <Col lg={12} md={12} sm={12}>
        <div 
          style={{
            background: 'linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)',
            ...shell,
          }}
        >
          <div className="px-3 px-sm-4">
          <div className="d-flex justify-content-between align-items-start">
            <div className="d-flex flex-column" style={{ flex: 1, minWidth: 0 }}>
              {/* Title Row with Stats; compact + actions = separate row so primary buttons are not squeezed off-screen */}
              {compact && rightAction ? (
                <>
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h1
                      className="mb-0"
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: '600',
                        color: '#FFFFFF',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2,
                        flex: '1 1 auto',
                        minWidth: 0,
                      }}
                    >
                      {title}
                    </h1>
                    {stats.length > 0 && (
                      <div className="d-flex align-items-center gap-1 flex-wrap justify-content-end flex-shrink-0">
                        {stats.map((stat, index) => {
                          const StatBadge = (
                            <div
                              key={index}
                              className="badge d-flex align-items-center gap-1"
                              style={{
                                background: index === 0 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)',
                                color: index === 0 ? '#4171F5' : '#FFFFFF',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '500',
                                cursor: stat.tooltip ? 'help' : 'default',
                              }}
                            >
                              {stat.icon && <stat.icon size={12} />}
                              {stat.label}: {stat.value}
                            </div>
                          );

                          if (stat.tooltip) {
                            return (
                              <OverlayTrigger
                                key={index}
                                placement="top"
                                overlay={<Tooltip>{stat.tooltip}</Tooltip>}
                              >
                                {StatBadge}
                              </OverlayTrigger>
                            );
                          }
                          return StatBadge;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="d-flex w-100 justify-content-end" style={{ flexShrink: 0 }}>
                    {rightAction}
                  </div>
                </>
              ) : (
                <div className={`d-flex justify-content-between align-items-center ${compact ? 'mb-0' : 'mb-2'}`}>
                  <h1
                    className="mb-0"
                    style={{
                      fontSize: compact ? '1.2rem' : '28px',
                      fontWeight: '600',
                      color: '#FFFFFF',
                      letterSpacing: '-0.02em',
                      lineHeight: compact ? 1.2 : undefined,
                    }}
                  >
                    {title}
                  </h1>
                  <div className={`d-flex align-items-center ${compact ? 'gap-1' : 'gap-2'}`}>
                    {stats.length > 0 && (
                      <div className={`d-flex align-items-center ${compact ? 'gap-1' : 'gap-2'} flex-wrap justify-content-end`}>
                        {stats.map((stat, index) => {
                          const StatBadge = (
                            <div
                              key={index}
                              className="badge d-flex align-items-center gap-1"
                              style={{
                                background: index === 0 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)',
                                color: index === 0 ? '#4171F5' : '#FFFFFF',
                                padding: compact ? '2px 6px' : '6px 12px',
                                borderRadius: '6px',
                                fontSize: compact ? '11px' : '14px',
                                fontWeight: '500',
                                cursor: stat.tooltip ? 'help' : 'default',
                              }}
                            >
                              {stat.icon && <stat.icon size={compact ? 12 : 14} />}
                              {stat.label}: {stat.value}
                            </div>
                          );

                          if (stat.tooltip) {
                            return (
                              <OverlayTrigger
                                key={index}
                                placement="top"
                                overlay={<Tooltip>{stat.tooltip}</Tooltip>}
                              >
                                {StatBadge}
                              </OverlayTrigger>
                            );
                          }
                          return StatBadge;
                        })}
                      </div>
                    )}
                    {rightAction && (
                      <div style={{ marginLeft: stats.length > 0 ? '8px' : '0', flexShrink: 0 }}>
                        {rightAction}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Section */}
              <div className={compact ? 'mb-1' : 'mb-3'}>
                {subtitle && (
                  <p 
                    className={compact ? 'mb-0' : 'mb-2'}
                    style={{ 
                      fontSize: compact ? '12px' : '16px',
                      color: 'rgba(255, 255, 255, 0.75)',
                      fontWeight: '400',
                      lineHeight: compact ? '1.3' : '1.5',
                    }}
                  >
                    {subtitle}
                  </p>
                )}

                {infoText && (
                  <div
                    className="d-flex align-items-center gap-2"
                    style={{
                      fontSize: compact ? '12px' : '14px',
                      color: 'rgba(255, 255, 255, 0.9)',
                      background: 'rgba(255, 255, 255, 0.1)',
                      padding: compact ? '5px 8px' : '8px 12px',
                      borderRadius: '6px',
                      marginTop: subtitle ? (compact ? '4px' : '8px') : '0',
                    }}
                  >
                    <i className="fe fe-info" style={{ fontSize: compact ? '14px' : '16px' }}></i>
                    <span>{infoText}</span>
                  </div>
                )}

                {badges.length > 0 && (
                  <div 
                    className="d-flex align-items-center gap-2" 
                    style={{ marginTop: infoText ? (compact ? '6px' : '12px') : subtitle ? (compact ? '4px' : '8px') : '0' }}
                  >
                    {badges.map((badge, index) => (
                      <span
                        key={index}
                        className="badge"
                        style={{
                          background: index === 0 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)',
                          color: index === 0 ? '#4171F5' : '#FFFFFF',
                          padding: compact ? '4px 8px' : '6px 12px',
                          borderRadius: '6px',
                          fontWeight: '500',
                          fontSize: compact ? '12px' : '14px',
                          cursor: badge.onClick ? 'pointer' : 'default',
                        }}
                        onClick={badge.onClick}
                      >
                        {badge.icon && <i className={`${badge.icon} me-1`}></i>}
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Breadcrumb Navigation */}
              {breadcrumbs.length > 0 && (
                <nav style={{ fontSize: compact ? '11px' : '14px', fontWeight: '500', marginTop: compact ? '2px' : 0 }}>
                  <div className="d-flex align-items-center">
                    {breadcrumbs.map((crumb, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && (
                          <span
                            className="mx-2"
                            style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                          >
                            /
                          </span>
                        )}
                        {crumb.icon && (
                          <i
                            className={crumb.icon}
                            style={{ 
                              color: index === breadcrumbs.length - 1 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)' 
                            }}
                          ></i>
                        )}
                        {crumb.href ? (
                          <Link
                            href={crumb.href}
                            className="text-decoration-none ms-2"
                            style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                          >
                            {crumb.label}
                          </Link>
                        ) : (
                          <span 
                            className={crumb.icon ? 'ms-2' : ''} 
                            style={{ 
                              color: index === breadcrumbs.length - 1 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)' 
                            }}
                          >
                            {crumb.label}
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </nav>
              )}
            </div>
          </div>
          </div>
        </div>
      </Col>
    </Row>
  );
};

export default DashboardHeader;

