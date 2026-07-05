import React, { useEffect, useState } from 'react';
import { Col, Row, Container, Spinner, Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { 
  Facebook,
  Twitter,
  Github,
  Linkedin,
  MessageCircle,
  Youtube,
  Book,
  Phone,
  Video
} from 'lucide-react';
import { getSupabaseClient } from '../../../lib/supabase/client';

const FooterWithSocialIcons = () => {
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    {
      name: 'LinkedIn',
      icon: Linkedin,
      href: 'https://www.linkedin.com/company/pixelcare-consulting-corporation'
    },
    {
      name: 'Facebook',
      icon: Facebook,
      href: 'https://facebook.com/pixelcareconsulting'
    },

    {
      name: 'WhatsApp',
      icon: Phone,
      href: 'https://web.whatsapp.com/send?phone=6594525848&text='
    },
    {
      name: 'YouTube',
      icon: Youtube,
      href: 'https://www.youtube.com/channel/UCuy8i19SmgQG-me8espY0Ag/videos?view=0&sort=p'
    },

    {
      name: 'Company Profile',
      icon: Book,
      href: 'https://heyzine.com/flip-book/3088ace65b.html#page/1'
    }
  ];

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        setIsLoading(true);
        setError('');
        
        const supabase = getSupabaseClient();
        if (!supabase) {
          setCompanyName('SAS M&E Pte Ltd');
          setIsLoading(false);
          return;
        }

        const { data: companyData, error } = await supabase
          .from('company_details')
          .select('name')
          .eq('id', 'companyInfo')
          .single();
        
        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (companyData) {
          setCompanyName(companyData.name);
        } else {
          setCompanyName('SAS M&E Pte Ltd');
        }
      } catch (err) {
        setError('Failed to load company information');
        setCompanyName('SAS M&E Pte Ltd');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanyInfo();
  }, []);

  return (
    <footer className="bg-white">
      <Container fluid>
        <Row className="py-4 border-top">
          <Col lg={{ span: 10, offset: 1 }}>
            <Row className="align-items-center">
              <Col lg={7} md={12} className="mb-3 mb-lg-0">
                {isLoading ? (
                  <div className="d-flex align-items-center">
                    <Spinner animation="border" size="sm" className="me-2" />
                    <span>Loading...</span>
                  </div>
                ) : error ? (
                  <Alert variant="danger" className="mb-0 py-2">
                    {error}
                  </Alert>
                ) : (
                  <p className="mb-0 text-secondary">
                    FSM Portal © {companyName} {currentYear}{' '}
                    All rights reserved | Powered by{' '}
                    <a 
                      href="https://pixelcareconsulting.com"
                      className="text-decoration-none link-primary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Pixelcare Consulting
                    </a>
                  </p>
                )}
              </Col>
              
              <Col lg={5} md={12}>
                <div className="d-flex flex-wrap justify-content-lg-end justify-content-center gap-3">
                  {socialLinks.map((social) => (
                    <OverlayTrigger
                      key={social.name}
                      placement="top"
                      overlay={<Tooltip id={`tooltip-${social.name}`}>{`Visit our ${social.name}`}</Tooltip>}
                    >
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary p-2 d-inline-flex align-items-center justify-content-center rounded-circle hover-icon"
                        aria-label={`Visit our ${social.name} page`}
                      >
                        <social.icon size={20} />
                      </a>
                    </OverlayTrigger>
                  ))}
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Container>

      <style jsx>{`
        .hover-icon {
          transition: all 0.3s ease;
        }
        .hover-icon:hover {
          transform: translateY(-3px);
          background: rgba(0, 0, 0, 0.05);
          color: #0d6efd;
        }
      `}</style>
    </footer>
  );
};

export default FooterWithSocialIcons;