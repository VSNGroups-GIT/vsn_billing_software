-- ============================================================================
-- BILLING MANAGEMENT SYSTEM - CONSOLIDATED DATABASE SETUP
-- ============================================================================
-- This script creates and configures the complete database schema including:
-- - Tables, enum types, and relationships
-- - Row Level Security (RLS) policies
-- - Triggers and functions
-- - Indexes for performance
-- - Multi-tenancy via organizations
--
-- Run this script on a fresh Supabase database to set up the entire system.
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS AND ENUMS
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'accountant');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'check', 'credit_card', 'other');

-- ============================================================================
-- SECTION 2: CORE TABLES
-- ============================================================================

-- Organizations table (multi-tenancy)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'accountant',
  is_active BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',
  notes TEXT,
  value_per_bird DECIMAL(10,2) DEFAULT 0,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products/Services table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  unit_price DECIMAL(10, 2) NOT NULL,
  paper_price DECIMAL(10, 2) NOT NULL,
  unit TEXT DEFAULT 'unit',
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client-Product pricing rules table
CREATE TABLE IF NOT EXISTS public.client_product_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  price_rule_type TEXT NOT NULL CHECK (price_rule_type IN ('discount_percentage', 'discount_flat', 'multiplier')),
  price_rule_value DECIMAL(10, 4) NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, product_id)
);

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  reference_number TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice items table
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  line_total DECIMAL(10, 2) NOT NULL,
  bird_count INTEGER,
  per_bird_adjustment DECIMAL(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method NOT NULL,
  reference_number TEXT,
  status payment_status NOT NULL DEFAULT 'completed',
  notes TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice templates table
CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_address TEXT NOT NULL,
  company_phone TEXT NOT NULL,
  company_email TEXT NOT NULL,
  company_logo_url TEXT,
  company_logo_file TEXT,
  tax_label TEXT DEFAULT 'GST',
  terms_and_conditions TEXT DEFAULT 'Payment is due within 30 days. Late payments may incur additional charges.',
  whatsapp_template_rows JSONB DEFAULT '[{"category":"Marketing","price_per_message":"89.5-Paisa","template_type":"Include promotions or offers, informational updates, or invitation for customers to respond/take action. Any conversation that does not qualify as utility or authentication"},{"category":"Utility","price_per_message":"25-Paisa","template_type":"Facilitate a specific, agreed-upon request or transaction or update to a customer about an ongoing transaction, including post-purchase notifications and recurring billing"},{"category":"Authentication","price_per_message":"16-Paisa","template_type":"Enable businesses to authenticate users with one-time passcodes, potentially at multiple steps in the login process(e.g., account verification, account recovery, integrity challenges)"},{"category":"Service","price_per_message":"0-Paisa","template_type":"All user-initiated conversations will be categorized as service conversations, which help customers resolve enquiries."}]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- Invoice notes table
CREATE TABLE IF NOT EXISTS public.invoice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment notes table
CREATE TABLE IF NOT EXISTS public.payment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Clients indexes
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON public.clients(organization_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);

-- Client-Product pricing indexes
CREATE INDEX IF NOT EXISTS idx_client_product_pricing_client_id ON public.client_product_pricing(client_id);
CREATE INDEX IF NOT EXISTS idx_client_product_pricing_product_id ON public.client_product_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_client_product_pricing_organization_id ON public.client_product_pricing(organization_id);

-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_reference_number ON public.invoices(reference_number);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);

-- Invoice items indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON public.payments(organization_id);

-- Invoice templates indexes
CREATE INDEX IF NOT EXISTS idx_invoice_templates_organization_id ON public.invoice_templates(organization_id);

-- Invoice notes indexes
CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON public.invoice_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_notes_created_at ON public.invoice_notes(created_at DESC);

-- Payment notes indexes
CREATE INDEX IF NOT EXISTS idx_payment_notes_payment_id ON public.payment_notes(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_notes_created_at ON public.payment_notes(created_at DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON public.notifications(reference_type, reference_id);

-- ============================================================================
-- SECTION 4: HELPER FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE id = user_id;
  
  RETURN org_id;
END;
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_value user_role;
BEGIN
  SELECT role INTO user_role_value
  FROM public.profiles
  WHERE id = user_id;
  
  RETURN user_role_value = 'super_admin';
END;
$$;

-- Function to automatically create profile and organization for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create a new organization for the user
  INSERT INTO public.organizations (name, email)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Organization'),
    NEW.email
  )
  RETURNING id INTO new_org_id;
  
  -- Insert profile with organization
  INSERT INTO public.profiles (id, email, full_name, role, is_active, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'super_admin'),
    COALESCE((NEW.raw_user_meta_data->>'is_active')::boolean, true),
    new_org_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Function to notify users on invoice note
CREATE OR REPLACE FUNCTION public.notify_users_on_invoice_note()
RETURNS TRIGGER AS $$
DECLARE
  reference_number TEXT;
  note_author_name TEXT;
  target_user RECORD;
BEGIN
  -- Get invoice number
  SELECT invoice_number INTO reference_number FROM public.invoices WHERE id = NEW.invoice_id;

  -- Get note author name
  SELECT full_name INTO note_author_name FROM public.profiles WHERE id = NEW.created_by;

  -- Notify all active users in the same organization except the author
  FOR target_user IN 
    SELECT p.id 
    FROM public.profiles p
    WHERE p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = NEW.created_by)
    AND p.id != NEW.created_by
    AND p.is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
    VALUES (
      target_user.id,
      'invoice_note',
      CONCAT('New note on Invoice ', reference_number),
      CONCAT(note_author_name, ' added a note: ', LEFT(NEW.note, 100), CASE WHEN LENGTH(NEW.note) > 100 THEN '...' ELSE '' END),
      NEW.invoice_id,
      'invoice'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to notify users on payment note
CREATE OR REPLACE FUNCTION public.notify_users_on_payment_note()
RETURNS TRIGGER AS $$
DECLARE
  note_author_name TEXT;
  target_user RECORD;
BEGIN
  -- Get note author name
  SELECT full_name INTO note_author_name FROM public.profiles WHERE id = NEW.created_by;

  -- Notify all active users in the same organization except the author
  FOR target_user IN 
    SELECT p.id 
    FROM public.profiles p
    WHERE p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = NEW.created_by)
    AND p.id != NEW.created_by
    AND p.is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
    VALUES (
      target_user.id,
      'payment_note',
      'New note on Payment',
      CONCAT(note_author_name, ' added a note: ', LEFT(NEW.note, 100), CASE WHEN LENGTH(NEW.note) > 100 THEN '...' ELSE '' END),
      NEW.payment_id,
      'payment'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update notes updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: TRIGGERS
-- ============================================================================

-- Trigger to handle new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Triggers for updated_at timestamps
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_product_pricing_updated_at
  BEFORE UPDATE ON public.client_product_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
  BEFORE UPDATE ON public.invoice_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_notes_updated_at
  BEFORE UPDATE ON public.invoice_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notes_updated_at();

CREATE TRIGGER update_payment_notes_updated_at
  BEFORE UPDATE ON public.payment_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notes_updated_at();

-- Notification triggers
DROP TRIGGER IF EXISTS notify_on_invoice_note ON public.invoice_notes;
CREATE TRIGGER notify_on_invoice_note
  AFTER INSERT ON public.invoice_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_users_on_invoice_note();

DROP TRIGGER IF EXISTS notify_on_payment_note ON public.payment_notes;
CREATE TRIGGER notify_on_payment_note
  AFTER INSERT ON public.payment_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_users_on_payment_note();

-- ============================================================================
-- SECTION 6: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_product_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (
    id = public.get_user_organization(auth.uid()) 
    AND public.is_admin(auth.uid())
  );

-- Profiles policies
CREATE POLICY "Enable read access for all authenticated users"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Super Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Clients policies
CREATE POLICY "Users can view clients in their organization"
  ON public.clients FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can create clients in their organization"
  ON public.clients FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can update clients in their organization"
  ON public.clients FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can delete clients"
  ON public.clients FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Products policies
CREATE POLICY "Users can view products in their organization"
  ON public.products FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can create products in their organization"
  ON public.products FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can update products in their organization"
  ON public.products FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can delete products"
  ON public.products FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Client-Product pricing policies
CREATE POLICY "Users can view pricing in their organization"
  ON public.client_product_pricing FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can create pricing rules"
  ON public.client_product_pricing FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Super Admins can update pricing rules"
  ON public.client_product_pricing FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Super Admins can delete pricing rules"
  ON public.client_product_pricing FOR DELETE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.is_admin(auth.uid())
  );

-- Invoices policies
CREATE POLICY "Users can view invoices in their organization"
  ON public.invoices FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can create invoices in their organization"
  ON public.invoices FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can update invoices in their organization"
  ON public.invoices FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can delete invoices"
  ON public.invoices FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Invoice items policies
CREATE POLICY "Authenticated users can view invoice items"
  ON public.invoice_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Payments policies
CREATE POLICY "Users can view payments in their organization"
  ON public.payments FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can create payments in their organization"
  ON public.payments FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can update payments"
  ON public.payments FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Super Admins can delete payments"
  ON public.payments FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Invoice templates policies
CREATE POLICY "Users can view their organization template"
  ON public.invoice_templates FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super Admins can insert template"
  ON public.invoice_templates FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Super Admins can update template"
  ON public.invoice_templates FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.is_admin(auth.uid())
  );

-- Invoice notes policies
CREATE POLICY "Users can view invoice notes in their org"
  ON public.invoice_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Admins and Super Admins can insert invoice notes"
  ON public.invoice_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
      AND p.is_active = true
    )
  );

CREATE POLICY "Users can update their own invoice notes"
  ON public.invoice_notes FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Super Admins can delete any invoice note"
  ON public.invoice_notes FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Payment notes policies
CREATE POLICY "Users can view payment notes in their org"
  ON public.payment_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Admins and Super Admins can insert payment notes"
  ON public.payment_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
      AND p.is_active = true
    )
  );

CREATE POLICY "Users can update their own payment notes"
  ON public.payment_notes FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Super Admins can delete any payment note"
  ON public.payment_notes FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- SECTION 7: TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE public.client_product_pricing IS 'Stores client-specific pricing rules for products (discounts or multipliers)';
COMMENT ON COLUMN public.client_product_pricing.price_rule_type IS 'Type of pricing rule: discount_percentage (10 = 10% off), discount_flat (10 = $10 off), multiplier (1.25 = price * 1.25)';
COMMENT ON COLUMN public.client_product_pricing.price_rule_value IS 'Value for the pricing rule based on type';
COMMENT ON COLUMN public.invoice_items.bird_count IS 'Number of birds for per-bird pricing calculation';
COMMENT ON COLUMN public.invoice_items.per_bird_adjustment IS 'Total per-bird adjustment amount applied to line total';

-- ============================================================================
-- END OF CONSOLIDATED DATABASE SETUP
-- ============================================================================
-- 
-- NEXT STEPS:
-- 1. Run this script in your Supabase SQL Editor
-- 2. Create your first admin user through the Supabase Dashboard
-- 3. Start using the application
-- 
-- ============================================================================

-- ============================================================================
-- Add price_category_id column to client_product_pricing table
-- ============================================================================

-- Add price_category_id column (nullable, can be NULL for legacy pricing rules)
ALTER TABLE public.client_product_pricing
ADD COLUMN IF NOT EXISTS price_category_id UUID REFERENCES public.price_categories(id) ON DELETE SET NULL;

-- Create index for faster lookups by category
CREATE INDEX IF NOT EXISTS idx_client_product_pricing_category_id ON public.client_product_pricing(price_category_id);

-- COMMENT FOR CLARITY
COMMENT ON COLUMN public.client_product_pricing.price_category_id IS 'Links this pricing rule to a price category for category-based pricing (nullable for legacy pricing rules)';

-- Add tax_id column to organizations (nullable)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS tax_id text;

-- Add is_active column to price_categories table
ALTER TABLE public.price_categories
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_price_categories_is_active ON public.price_categories(is_active);

-- Add comment
COMMENT ON COLUMN public.price_categories.is_active IS 'Whether this price category is currently active and available for use';
-- Add position/order columns to price_categories and products tables for drag-and-drop reordering

-- Add position column to price_categories
ALTER TABLE public.price_categories
ADD COLUMN IF NOT EXISTS position INTEGER;

-- Set initial positions based on name (alphabetical)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY name) as pos
  FROM public.price_categories
)
UPDATE public.price_categories
SET position = ranked.pos
FROM ranked
WHERE public.price_categories.id = ranked.id;

-- Make position NOT NULL after setting values
ALTER TABLE public.price_categories
ALTER COLUMN position SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_price_categories_position ON public.price_categories(organization_id, position);

-- Add position column to products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS position INTEGER;

-- Set initial positions based on name (alphabetical)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY name) as pos
  FROM public.products
)
UPDATE public.products
SET position = ranked.pos
FROM ranked
WHERE public.products.id = ranked.id;

-- Make position NOT NULL after setting values
ALTER TABLE public.products
ALTER COLUMN position SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_position ON public.products(organization_id, position);

-- Add comments
COMMENT ON COLUMN public.price_categories.position IS 'Display order position for drag-and-drop reordering';
COMMENT ON COLUMN public.products.position IS 'Display order position for drag-and-drop reordering';

-- Allow organization members (any role) to insert/update price history within their org
-- Existing super_admin-only policies remain, this adds org-scoped access for admin/accountant too.

CREATE POLICY "Org users can create price history"
  ON public.price_category_history
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
  );

CREATE POLICY "Org users can update price history"
  ON public.price_category_history
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
  );

-- Add automated reports configuration to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS automated_reports_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS automated_report_settings JSONB DEFAULT '{"weekly": false, "monthly": false, "semi-annual": false, "annual": false}'::jsonb,
ADD COLUMN IF NOT EXISTS report_email TEXT;

-- Update existing rows to use organization email as report email
UPDATE organizations 
SET report_email = email 
WHERE report_email IS NULL AND email IS NOT NULL;

COMMENT ON COLUMN organizations.automated_reports_enabled IS 'Whether automated reports are enabled for this organization';
COMMENT ON COLUMN organizations.automated_report_settings IS 'Settings for which report frequencies are enabled: weekly, monthly, semi-annual, annual';
COMMENT ON COLUMN organizations.report_email IS 'Email address to send automated reports to';

ALTER TABLE client_product_pricing
ADD COLUMN fixed_base_value NUMERIC(10, 4) NULL;

ALTER TABLE client_product_pricing
DROP CONSTRAINT IF EXISTS client_product_pricing_price_rule_type_check;

ALTER TABLE client_product_pricing
ADD CONSTRAINT client_product_pricing_price_rule_type_check
CHECK (price_rule_type IN ('discount_percentage', 'discount_flat', 'multiplier', 'flat_addition'));

ALTER TABLE clients
ADD COLUMN due_days_type VARCHAR(50) DEFAULT 'fixed_days' CHECK (due_days_type IN ('fixed_days', 'end_of_month'));

COMMENT ON COLUMN clients.due_days_type IS 'Type of due days: "fixed_days" for numeric days, "end_of_month" for end of month';

ALTER TABLE invoices
ADD COLUMN due_days_type VARCHAR(50) DEFAULT 'fixed_days' CHECK (due_days_type IN ('fixed_days', ' '));

COMMENT ON COLUMN invoices.due_days_type IS 'Type of due date: "fixed_days" for numeric days, "end_of_month" for end of month';

-- Update invoice status enum to include 'recorded'
-- First, drop the default constraint on the status column
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;

-- Rename old enum
ALTER TYPE invoice_status RENAME TO invoice_status_old;

-- Create new enum with all statuses
CREATE TYPE invoice_status AS ENUM ('draft', 'recorded', 'paid', 'overdue', 'cancelled');

-- Convert column to new type
ALTER TABLE invoices ALTER COLUMN status TYPE invoice_status USING status::text::invoice_status;

-- Set default back to 'draft'
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'::invoice_status;

-- Drop old enum
DROP TYPE invoice_status_old;

ALTER TABLE IF EXISTS clients
ADD COLUMN IF NOT EXISTS enable_per_bird BOOLEAN DEFAULT false;

COMMENT ON COLUMN clients.enable_per_bird IS 'Whether to enable per-bird adjustment for this client';

ALTER TABLE invoices
ADD COLUMN total_birds INTEGER DEFAULT 0;

COMMENT ON COLUMN invoices.total_birds IS 'Total number of birds for per-bird adjustment calculation';

-- Add 'partially_paid' status to invoice_status enum
-- First, drop the default constraint on the status column
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;

-- Rename old enum
ALTER TYPE invoice_status RENAME TO invoice_status_old;

-- Create new enum with partially_paid status added
CREATE TYPE invoice_status AS ENUM ('draft', 'recorded', 'partially_paid', 'paid', 'overdue', 'cancelled');

-- Convert column to new type
ALTER TABLE invoices ALTER COLUMN status TYPE invoice_status USING status::text::invoice_status;

-- Set default back to 'draft'
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'::invoice_status;

-- Drop old enum
DROP TYPE invoice_status_old;

-- Add conditional discount support to client_product_pricing table
-- This migration adds columns for conditional discount functionality

-- Add new columns for conditional discount
ALTER TABLE client_product_pricing
ADD COLUMN conditional_threshold NUMERIC(10, 4),
ADD COLUMN conditional_discount_below NUMERIC(10, 4),
ADD COLUMN conditional_discount_above_equal NUMERIC(10, 4);

-- Add comment to explain the columns
COMMENT ON COLUMN client_product_pricing.conditional_threshold IS 'Threshold amount for conditional discount. Applied when price_rule_type is conditional_discount.';
COMMENT ON COLUMN client_product_pricing.conditional_discount_below IS 'Discount (₹) to apply when amount is below conditional_threshold.';
COMMENT ON COLUMN client_product_pricing.conditional_discount_above_equal IS 'Discount (₹) to apply when amount is greater than or equal to conditional_threshold.';

-- Update the price_rule_type constraint to include conditional_discount
ALTER TABLE client_product_pricing
DROP CONSTRAINT IF EXISTS client_product_pricing_price_rule_type_check;

ALTER TABLE client_product_pricing
ADD CONSTRAINT client_product_pricing_price_rule_type_check
CHECK (price_rule_type IN ('discount_percentage', 'discount_flat', 'multiplier', 'flat_addition', 'conditional_discount'));

ALTER TABLE client_product_pricing
ALTER COLUMN price_rule_value DROP NOT NULL;