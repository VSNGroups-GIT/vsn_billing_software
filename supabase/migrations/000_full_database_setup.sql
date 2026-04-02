-- ============================================================================
-- BILLING SOFTWARE - FULL DATABASE BOOTSTRAP (FRESH DB)
-- ============================================================================
-- Purpose:
--   Single-file setup for a new database.
--   This script consolidates schema + feature migrations into one idempotent file.
--
-- Notes:
--   1) Run on a fresh Supabase project.
--   2) Uses auth.users from Supabase Auth.
--   3) Safe to re-run (uses IF NOT EXISTS and DROP ... IF EXISTS patterns).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------------
-- 2) Enum types
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'accountant');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('draft', 'recorded', 'partially_paid', 'paid', 'overdue', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'check', 'credit_card', 'other');
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3) Core tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'India',
  tax_id TEXT,
  automated_reports_enabled BOOLEAN DEFAULT false,
  automated_report_settings JSONB DEFAULT '{"daily": false, "weekly": false, "monthly": false, "semi-annual": false, "annual": false}'::jsonb,
  report_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  tax_id TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'India',
  notes TEXT,
  due_days INTEGER DEFAULT 30,
  due_days_type VARCHAR(50) DEFAULT 'fixed_days' CHECK (due_days_type IN ('fixed_days', 'end_of_month')),
  enable_per_bird BOOLEAN DEFAULT false,
  value_per_bird NUMERIC(10, 2) DEFAULT 0,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  hsn_code TEXT,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  paper_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'unit',
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  operator_id UUID REFERENCES public.operators(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.price_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER DEFAULT 0,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.price_category_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_category_id UUID NOT NULL REFERENCES public.price_categories(id) ON DELETE CASCADE,
  price NUMERIC(10, 4) NOT NULL,
  effective_date DATE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (price_category_id, effective_date)
);

CREATE TABLE IF NOT EXISTS public.client_product_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  price_category_id UUID REFERENCES public.price_categories(id) ON DELETE SET NULL,
  fixed_base_value NUMERIC(10, 4) NULL,
  operator_price NUMERIC(10, 4) NOT NULL DEFAULT 0,
  price_rule_type TEXT NOT NULL,
  price_rule_value NUMERIC(10, 4) NULL,
  conditional_threshold NUMERIC(10, 4),
  conditional_discount_below NUMERIC(10, 4),
  conditional_discount_above_equal NUMERIC(10, 4),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, product_id)
);

ALTER TABLE public.client_product_pricing
DROP CONSTRAINT IF EXISTS client_product_pricing_price_rule_type_check;

ALTER TABLE public.client_product_pricing
ADD CONSTRAINT client_product_pricing_price_rule_type_check
CHECK (price_rule_type IN ('discount_percentage', 'discount_flat', 'multiplier', 'flat_addition', 'conditional_discount'));

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  reference_number TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  due_days_type VARCHAR(50) DEFAULT 'fixed_days' CHECK (due_days_type IN ('fixed_days', 'end_of_month')),
  status invoice_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_birds INTEGER DEFAULT 0,
  notes TEXT,
  gst_percent NUMERIC(10,4) DEFAULT 0,
  split_gst BOOLEAN DEFAULT FALSE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10, 2) NOT NULL,
  bird_count INTEGER,
  per_bird_adjustment NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method NOT NULL,
  reference_number TEXT,
  status payment_status NOT NULL DEFAULT 'completed',
  notes TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_address TEXT NOT NULL,
  company_phone TEXT NOT NULL,
  company_email TEXT NOT NULL,
  company_logo_url TEXT,
  company_logo_file TEXT,
  tax_label TEXT DEFAULT 'GST',
  note_content TEXT DEFAULT '1. Material once sold will not be taken back.\n2. Kindly verify quantity and amount before confirmation.',
  payment_instructions TEXT DEFAULT '1. Please make all payments to the company account only.\n2. Share payment confirmation with transaction reference.\n3. Contact billing support for any clarification.',
  terms_and_conditions TEXT DEFAULT 'Payment is due within 30 days. Late payments may incur additional charges.',
  whatsapp_template_rows JSONB DEFAULT '[{"category":"Marketing","price_per_message":"89.5-Paisa","template_type":"Include promotions or offers, informational updates, or invitation for customers to respond/take action. Any conversation that does not qualify as utility or authentication"},{"category":"Utility","price_per_message":"25-Paisa","template_type":"Facilitate a specific, agreed-upon request or transaction or update to a customer about an ongoing transaction, including post-purchase notifications and recurring billing"},{"category":"Authentication","price_per_message":"16-Paisa","template_type":"Enable businesses to authenticate users with one-time passcodes, potentially at multiple steps in the login process(e.g., account verification, account recovery, integrity challenges)"},{"category":"Service","price_per_message":"0-Paisa","template_type":"All user-initiated conversations will be categorized as service conversations, which help customers resolve enquiries."}]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  reference_number TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  quotation_type TEXT NOT NULL DEFAULT 'other' CHECK (quotation_type IN ('whatsapp', 'other')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('draft', 'recorded', 'converted', 'cancelled')),
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  line_total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- 4) Indexes
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);

CREATE UNIQUE INDEX IF NOT EXISTS operators_org_name_unique ON public.operators (organization_id, lower(name));
CREATE INDEX IF NOT EXISTS operators_org_idx ON public.operators (organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_position ON public.products(organization_id, position);
CREATE INDEX IF NOT EXISTS products_operator_idx ON public.products(operator_id);

CREATE INDEX IF NOT EXISTS idx_price_categories_org ON public.price_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_price_categories_is_active ON public.price_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_price_categories_position ON public.price_categories(organization_id, position);

CREATE INDEX IF NOT EXISTS idx_price_history_category_date ON public.price_category_history(price_category_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_org ON public.price_category_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_cpp_client_id ON public.client_product_pricing(client_id);
CREATE INDEX IF NOT EXISTS idx_cpp_product_id ON public.client_product_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_cpp_organization_id ON public.client_product_pricing(organization_id);
CREATE INDEX IF NOT EXISTS idx_cpp_category_id ON public.client_product_pricing(price_category_id);
CREATE INDEX IF NOT EXISTS idx_cpp_fixed_base_value ON public.client_product_pricing(fixed_base_value) WHERE fixed_base_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_invoice_templates_organization_id ON public.invoice_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON public.invoice_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_notes_created_at ON public.invoice_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_notes_payment_id ON public.payment_notes(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_notes_created_at ON public.payment_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON public.notifications(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON public.quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id ON public.quotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);

-- --------------------------------------------------------------------------
-- 5) Helper functions
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, email)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Organization'),
    NEW.email
  )
  RETURNING id INTO new_org_id;

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

CREATE OR REPLACE FUNCTION public.notify_users_on_invoice_note()
RETURNS TRIGGER AS $$
DECLARE
  ref_number TEXT;
  note_author_name TEXT;
  target_user RECORD;
BEGIN
  SELECT invoice_number INTO ref_number FROM public.invoices WHERE id = NEW.invoice_id;
  SELECT full_name INTO note_author_name FROM public.profiles WHERE id = NEW.created_by;

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
      CONCAT('New note on Invoice ', COALESCE(ref_number, '')), 
      CONCAT(COALESCE(note_author_name, 'User'), ' added a note: ', LEFT(NEW.note, 100), CASE WHEN LENGTH(NEW.note) > 100 THEN '...' ELSE '' END),
      NEW.invoice_id,
      'invoice'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.notify_users_on_payment_note()
RETURNS TRIGGER AS $$
DECLARE
  note_author_name TEXT;
  target_user RECORD;
BEGIN
  SELECT full_name INTO note_author_name FROM public.profiles WHERE id = NEW.created_by;

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
      CONCAT(COALESCE(note_author_name, 'User'), ' added a note: ', LEFT(NEW.note, 100), CASE WHEN LENGTH(NEW.note) > 100 THEN '...' ELSE '' END),
      NEW.payment_id,
      'payment'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- 6) Triggers
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_operators_updated_at ON public.operators;
CREATE TRIGGER update_operators_updated_at
  BEFORE UPDATE ON public.operators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_categories_updated_at ON public.price_categories;
CREATE TRIGGER update_price_categories_updated_at
  BEFORE UPDATE ON public.price_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_history_updated_at ON public.price_category_history;
CREATE TRIGGER update_price_history_updated_at
  BEFORE UPDATE ON public.price_category_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_product_pricing_updated_at ON public.client_product_pricing;
CREATE TRIGGER update_client_product_pricing_updated_at
  BEFORE UPDATE ON public.client_product_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoice_templates_updated_at ON public.invoice_templates;
CREATE TRIGGER update_invoice_templates_updated_at
  BEFORE UPDATE ON public.invoice_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoice_notes_updated_at ON public.invoice_notes;
CREATE TRIGGER update_invoice_notes_updated_at
  BEFORE UPDATE ON public.invoice_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notes_updated_at();

DROP TRIGGER IF EXISTS update_payment_notes_updated_at ON public.payment_notes;
CREATE TRIGGER update_payment_notes_updated_at
  BEFORE UPDATE ON public.payment_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notes_updated_at();

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

DROP TRIGGER IF EXISTS update_quotations_updated_at ON public.quotations;
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------------------
-- 7) RLS + policies
-- --------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_category_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_product_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Organizations
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can update their organization" ON public.organizations;
CREATE POLICY "Super Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

-- Profiles
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.profiles;
CREATE POLICY "Enable read access for all authenticated users"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Super Admins can delete profiles" ON public.profiles;
CREATE POLICY "Super Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Clients
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;
CREATE POLICY "Users can view clients in their organization"
  ON public.clients FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create clients in their organization" ON public.clients;
CREATE POLICY "Users can create clients in their organization"
  ON public.clients FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
CREATE POLICY "Users can update clients in their organization"
  ON public.clients FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete clients" ON public.clients;
CREATE POLICY "Super Admins can delete clients"
  ON public.clients FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Operators
DROP POLICY IF EXISTS "Users can view operators in their organization" ON public.operators;
CREATE POLICY "Users can view operators in their organization"
  ON public.operators FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create operators in their organization" ON public.operators;
CREATE POLICY "Users can create operators in their organization"
  ON public.operators FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update operators in their organization" ON public.operators;
CREATE POLICY "Users can update operators in their organization"
  ON public.operators FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete operators" ON public.operators;
CREATE POLICY "Super Admins can delete operators"
  ON public.operators FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Products
DROP POLICY IF EXISTS "Users can view products in their organization" ON public.products;
CREATE POLICY "Users can view products in their organization"
  ON public.products FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create products in their organization" ON public.products;
CREATE POLICY "Users can create products in their organization"
  ON public.products FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update products in their organization" ON public.products;
CREATE POLICY "Users can update products in their organization"
  ON public.products FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete products" ON public.products;
CREATE POLICY "Super Admins can delete products"
  ON public.products FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Price categories
DROP POLICY IF EXISTS "Users can view categories in their organization" ON public.price_categories;
CREATE POLICY "Users can view categories in their organization"
  ON public.price_categories FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create categories in their organization" ON public.price_categories;
CREATE POLICY "Users can create categories in their organization"
  ON public.price_categories FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update categories in their organization" ON public.price_categories;
CREATE POLICY "Users can update categories in their organization"
  ON public.price_categories FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete categories" ON public.price_categories;
CREATE POLICY "Super Admins can delete categories"
  ON public.price_categories FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Price history
DROP POLICY IF EXISTS "Users can view price history in their organization" ON public.price_category_history;
CREATE POLICY "Users can view price history in their organization"
  ON public.price_category_history FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Org users can create price history" ON public.price_category_history;
CREATE POLICY "Org users can create price history"
  ON public.price_category_history FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Org users can update price history" ON public.price_category_history;
CREATE POLICY "Org users can update price history"
  ON public.price_category_history FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete price history" ON public.price_category_history;
CREATE POLICY "Super Admins can delete price history"
  ON public.price_category_history FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Client pricing rules
DROP POLICY IF EXISTS "Users can view pricing in their organization" ON public.client_product_pricing;
CREATE POLICY "Users can view pricing in their organization"
  ON public.client_product_pricing FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can create pricing rules" ON public.client_product_pricing;
CREATE POLICY "Super Admins can create pricing rules"
  ON public.client_product_pricing FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can update pricing rules" ON public.client_product_pricing;
CREATE POLICY "Super Admins can update pricing rules"
  ON public.client_product_pricing FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete pricing rules" ON public.client_product_pricing;
CREATE POLICY "Super Admins can delete pricing rules"
  ON public.client_product_pricing FOR DELETE
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

-- Invoices
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;
CREATE POLICY "Users can view invoices in their organization"
  ON public.invoices FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create invoices in their organization" ON public.invoices;
CREATE POLICY "Users can create invoices in their organization"
  ON public.invoices FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update invoices in their organization" ON public.invoices;
CREATE POLICY "Users can update invoices in their organization"
  ON public.invoices FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete invoices" ON public.invoices;
CREATE POLICY "Super Admins can delete invoices"
  ON public.invoices FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Invoice items
DROP POLICY IF EXISTS "Authenticated users can view invoice items" ON public.invoice_items;
CREATE POLICY "Authenticated users can view invoice items"
  ON public.invoice_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage invoice items" ON public.invoice_items;
CREATE POLICY "Authenticated users can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Payments
DROP POLICY IF EXISTS "Users can view payments in their organization" ON public.payments;
CREATE POLICY "Users can view payments in their organization"
  ON public.payments FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create payments in their organization" ON public.payments;
CREATE POLICY "Users can create payments in their organization"
  ON public.payments FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can update payments" ON public.payments;
CREATE POLICY "Super Admins can update payments"
  ON public.payments FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete payments" ON public.payments;
CREATE POLICY "Super Admins can delete payments"
  ON public.payments FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Invoice templates
DROP POLICY IF EXISTS "Users can view their organization template" ON public.invoice_templates;
CREATE POLICY "Users can view their organization template"
  ON public.invoice_templates FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can insert template" ON public.invoice_templates;
CREATE POLICY "Super Admins can insert template"
  ON public.invoice_templates FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can update template" ON public.invoice_templates;
CREATE POLICY "Super Admins can update template"
  ON public.invoice_templates FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.is_admin(auth.uid()));

-- Invoice notes
DROP POLICY IF EXISTS "Users can view invoice notes in their org" ON public.invoice_notes;
CREATE POLICY "Users can view invoice notes in their org"
  ON public.invoice_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_notes.invoice_id
        AND i.organization_id = public.get_user_organization(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins and Super Admins can insert invoice notes" ON public.invoice_notes;
CREATE POLICY "Admins and Super Admins can insert invoice notes"
  ON public.invoice_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update their own invoice notes" ON public.invoice_notes;
CREATE POLICY "Users can update their own invoice notes"
  ON public.invoice_notes FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Super Admins can delete any invoice note" ON public.invoice_notes;
CREATE POLICY "Super Admins can delete any invoice note"
  ON public.invoice_notes FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Payment notes
DROP POLICY IF EXISTS "Users can view payment notes in their org" ON public.payment_notes;
CREATE POLICY "Users can view payment notes in their org"
  ON public.payment_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_notes.payment_id
        AND p.organization_id = public.get_user_organization(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins and Super Admins can insert payment notes" ON public.payment_notes;
CREATE POLICY "Admins and Super Admins can insert payment notes"
  ON public.payment_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update their own payment notes" ON public.payment_notes;
CREATE POLICY "Users can update their own payment notes"
  ON public.payment_notes FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Super Admins can delete any payment note" ON public.payment_notes;
CREATE POLICY "Super Admins can delete any payment note"
  ON public.payment_notes FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- Quotations
DROP POLICY IF EXISTS "Users can view quotations in their organization" ON public.quotations;
CREATE POLICY "Users can view quotations in their organization"
  ON public.quotations FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create quotations in their organization" ON public.quotations;
CREATE POLICY "Users can create quotations in their organization"
  ON public.quotations FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update quotations in their organization" ON public.quotations;
CREATE POLICY "Users can update quotations in their organization"
  ON public.quotations FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete quotations" ON public.quotations;
CREATE POLICY "Super Admins can delete quotations"
  ON public.quotations FOR DELETE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view quotation items" ON public.quotation_items;
CREATE POLICY "Authenticated users can view quotation items"
  ON public.quotation_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage quotation items" ON public.quotation_items;
CREATE POLICY "Authenticated users can manage quotation items"
  ON public.quotation_items FOR ALL
  USING (auth.uid() IS NOT NULL);

-- --------------------------------------------------------------------------
-- 8) Comments
-- --------------------------------------------------------------------------
COMMENT ON TABLE public.client_product_pricing IS 'Stores client-specific pricing rules for products';
COMMENT ON COLUMN public.client_product_pricing.price_rule_type IS 'Rule type: discount_percentage, discount_flat, multiplier, flat_addition, conditional_discount';
COMMENT ON COLUMN public.client_product_pricing.price_rule_value IS 'Primary numeric value for rule type (nullable for conditional_discount)';
COMMENT ON COLUMN public.client_product_pricing.conditional_threshold IS 'Threshold amount for conditional discount';
COMMENT ON COLUMN public.client_product_pricing.conditional_discount_below IS 'Discount amount when value is below threshold';
COMMENT ON COLUMN public.client_product_pricing.conditional_discount_above_equal IS 'Discount amount when value is above/equal threshold';
COMMENT ON COLUMN public.invoices.total_birds IS 'Total birds used for legacy per-bird adjustment calculations';
COMMENT ON COLUMN public.clients.due_days_type IS 'fixed_days or end_of_month';
COMMENT ON COLUMN public.invoices.due_days_type IS 'fixed_days or end_of_month';
COMMENT ON COLUMN public.products.position IS 'Display order for drag-and-drop sorting';
COMMENT ON COLUMN public.price_categories.position IS 'Display order for drag-and-drop sorting';
COMMENT ON COLUMN public.operators.is_active IS 'Whether operator is available for product mapping';
COMMENT ON COLUMN public.quotations.quotation_type IS 'Quotation format type: whatsapp or other';
COMMENT ON COLUMN public.quotations.converted_invoice_id IS 'Reference to invoice created from quotation conversion';

-- ============================================================================
-- END OF FULL DATABASE BOOTSTRAP
-- ============================================================================
