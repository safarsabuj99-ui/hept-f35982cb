
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE public.ad_platform AS ENUM ('meta', 'tiktok', 'google');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type transaction_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  platform ad_platform,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Security definer helper: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles RLS
CREATE POLICY "Admins can do everything on profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- User roles RLS
CREATE POLICY "Admins can do everything on user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Transactions RLS
CREATE POLICY "Admins can do everything on transactions"
  ON public.transactions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can read own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Edge function to create client accounts (admin only)
-- We'll handle this via a Supabase edge function that uses service_role key
