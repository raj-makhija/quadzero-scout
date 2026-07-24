import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubVendorContactSection } from '../SubVendorContactSection';

describe('SubVendorContactSection', () => {
  it('renders the block for a resolved submission with a subVendorId', () => {
    render(
      <SubVendorContactSection
        subVendorId="sv_001"
        subVendorName="TechStaff Solutions"
        subVendorContactPerson="Ravi Kumar"
        subVendorContactPhone="+91-9000000000"
        subVendorContactEmail="ravi@techstaff.com"
        hasDirectContact
      />
    );

    expect(screen.getByText('Sub-Vendor: TechStaff Solutions')).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('+91-9000000000')).toBeInTheDocument();
    expect(screen.getByText('ravi@techstaff.com')).toBeInTheDocument();
  });

  it('renders the block for an unmatched (id-less) submission with extracted contacts', () => {
    render(
      <SubVendorContactSection
        subVendorName="SigCorp"
        subVendorContactPerson="Sig Person"
        subVendorContactPhone="+91-3333333333"
        subVendorContactEmail="sig@sigcorp.com"
        hasDirectContact={false}
      />
    );

    expect(screen.getByText('Sub-Vendor: SigCorp')).toBeInTheDocument();
    expect(screen.getByText('Sig Person')).toBeInTheDocument();
    expect(screen.getByText('+91-3333333333')).toBeInTheDocument();
    expect(screen.getByText('sig@sigcorp.com')).toBeInTheDocument();
  });

  it('renders nothing when no sub-vendor field is present', () => {
    const { container } = render(<SubVendorContactSection hasDirectContact />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the contact-person field independently', () => {
    render(<SubVendorContactSection subVendorContactPerson="Only Person" hasDirectContact />);

    expect(screen.getByText('Contact Person')).toBeInTheDocument();
    expect(screen.getByText('Only Person')).toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('renders the phone field independently as a tel link', () => {
    render(<SubVendorContactSection subVendorContactPhone="+91-4444444444" hasDirectContact />);

    const link = screen.getByRole('link', { name: /\+91-4444444444/ });
    expect(link).toHaveAttribute('href', 'tel:+91-4444444444');
    expect(screen.queryByText('Contact Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('renders the email field independently as a mailto link', () => {
    render(<SubVendorContactSection subVendorContactEmail="only@vendor.com" hasDirectContact />);

    const link = screen.getByRole('link', { name: /only@vendor.com/ });
    expect(link).toHaveAttribute('href', 'mailto:only@vendor.com');
    expect(screen.queryByText('Contact Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('omits the colon in the header when no vendor name is present', () => {
    render(<SubVendorContactSection subVendorContactEmail="only@vendor.com" hasDirectContact />);

    expect(screen.getByText('Sub-Vendor')).toBeInTheDocument();
    expect(screen.queryByText(/Sub-Vendor:/)).not.toBeInTheDocument();
  });

  it('shows the no-direct-contact hint only when the candidate lacks phone and email', () => {
    const { rerender } = render(
      <SubVendorContactSection subVendorContactEmail="v@vendor.com" hasDirectContact={false} />
    );
    expect(screen.getByText(/no direct contact info/i)).toBeInTheDocument();

    rerender(<SubVendorContactSection subVendorContactEmail="v@vendor.com" hasDirectContact />);
    expect(screen.queryByText(/no direct contact info/i)).not.toBeInTheDocument();
  });
});
