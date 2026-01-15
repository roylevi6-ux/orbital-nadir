-- Create accounts table
create type account_type as enum ('savings', 'checking', 'investment', 'retirement', 'crypto', 'other');

create table if not exists accounts (
    id uuid default gen_random_uuid() primary key,
    household_id uuid references households(id) on delete cascade not null,
    name text not null,
    type account_type not null,
    balance numeric not null default 0,
    currency text not null default 'ILS',
    institution text,
    is_archived boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create account_history table
create table if not exists account_history (
    id uuid default gen_random_uuid() primary key,
    account_id uuid references accounts(id) on delete cascade not null,
    balance numeric not null,
    balance_ils numeric not null,
    exchange_rate numeric not null default 1,
    date timestamp with time zone default timezone('utc'::text, now()) not null,
    note text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create goals table
create table if not exists goals (
    id uuid default gen_random_uuid() primary key,
    household_id uuid references households(id) on delete cascade not null,
    name text not null,
    target_amount numeric not null,
    current_amount numeric default 0,
    target_date date,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table accounts enable row level security;
alter table account_history enable row level security;
alter table goals enable row level security;

-- Create policies (assuming shared household access like transactions)
create policy "Users can view accounts in their household"
    on accounts for select
    using (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));

create policy "Users can insert accounts in their household"
    on accounts for insert
    with check (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));

create policy "Users can update accounts in their household"
    on accounts for update
    using (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));

create policy "Users can delete accounts in their household"
    on accounts for delete
    using (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));

-- Policies for account_history (view/insert mainly)
create policy "Users can view history for their accounts"
    on account_history for select
    using (account_id in (
        select id from accounts where household_id in (
            select household_id from user_profiles where id = auth.uid()
        )
    ));

create policy "Users can insert history for their accounts"
    on account_history for insert
    with check (account_id in (
        select id from accounts where household_id in (
            select household_id from user_profiles where id = auth.uid()
        )
    ));

-- Policies for goals
create policy "Users can view goals in their household"
    on goals for select
    using (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));

create policy "Users can manage goals in their household"
    on goals for all
    using (household_id in (
        select household_id from user_profiles where id = auth.uid()
    ));
