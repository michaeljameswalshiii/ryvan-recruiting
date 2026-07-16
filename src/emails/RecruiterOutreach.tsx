import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface RecruiterOutreachProps {
  name: string;
  company: string;
  ctaUrl?: string;
}

export default function RecruiterOutreach({ name, company, ctaUrl = 'https://turnkey-optimization.com' }: RecruiterOutreachProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <Container style={{ padding: '40px 0' }}>
          <Text style={{ fontSize: '14px', color: '#8898bb', marginBottom: '8px' }}>Trio Recruiting</Text>
          
          <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#32325d', marginBottom: '24px' }}>
            Let's discuss your hiring needs at {company}
          </Text>
          
          <Text style={{ fontSize: '16px', color: '#525f7f', lineHeight: '24px', marginBottom: '24px' }}>
            Hi {name},
          </Text>
          
          <Text style={{ fontSize: '16px', color: '#525f7f', lineHeight: '24px', marginBottom: '24px' }}>
            I'm reaching out from Trio Recruiting. We specialize in helping companies build high-quality engineering teams through our AI-powered sourcing platform.
          </Text>
          
          <Text style={{ fontSize: '16px', color: '#525f7f', lineHeight: '24px', marginBottom: '32px' }}>
            I'd love to schedule a brief call to understand your hiring goals and share how we've helped similar companies accelerate their recruitment process.
          </Text>
          
          <Button 
            href={ctaUrl}
            style={{
              backgroundColor: '#6564db',
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 'bold',
              padding: '12px 24px',
              textDecoration: 'none',
              display: 'inline-block'
            }}
          >
            Schedule a Call
          </Button>
          
          <Text style={{ fontSize: '14px', color: '#8898bb', marginTop: '32px', borderTop: '1px solid #e6ebf1', paddingTop: '24px' }}>
            Best regards,
            <br />
            The Trio Recruiting Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
