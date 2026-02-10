class Admin::DashboardController < Admin::BaseController
  DEFAULT_PREVIEW_LIMIT = 30
  MAX_PREVIEW_LIMIT = 200
  MIN_PREVIEW_LIMIT = 10
  INTERNAL_TABLES = %w[schema_migrations ar_internal_metadata].freeze

  def index
    @stats = {
      users: User.count,
      clubs: Club.count,
      members: Member.count,
      matches: Match.count,
      teams: Team.count,
      team_members: TeamMember.count,
      games: Game.count
    }

    load_database_preview!
  end

  private

  def load_database_preview!
    connection = ActiveRecord::Base.connection
    @database_adapter = connection.adapter_name
    @database_name = connection.pool.db_config.database

    @db_tables = connection.tables
                           .reject { |table| internal_table?(table) }
                           .sort
    @table_counts = @db_tables.to_h { |table| [ table, safe_table_count(connection, table) ] }

    @selected_table = params[:table].to_s
    @selected_table = @db_tables.first unless @db_tables.include?(@selected_table)

    requested_limit = params[:limit].to_i
    @selected_limit = requested_limit.positive? ? requested_limit : DEFAULT_PREVIEW_LIMIT
    @selected_limit = @selected_limit.clamp(MIN_PREVIEW_LIMIT, MAX_PREVIEW_LIMIT)

    if @selected_table.present?
      @selected_columns = connection.columns(@selected_table).map(&:name)
      @selected_rows = fetch_table_rows(connection, @selected_table, @selected_limit)
    else
      @selected_columns = []
      @selected_rows = []
    end
  end

  def internal_table?(table_name)
    INTERNAL_TABLES.include?(table_name) || table_name.start_with?("sqlite_")
  end

  def safe_table_count(connection, table_name)
    quoted_table = connection.quote_table_name(table_name)
    connection.select_value("SELECT COUNT(*) FROM #{quoted_table}").to_i
  rescue StandardError
    0
  end

  def fetch_table_rows(connection, table_name, limit)
    quoted_table = connection.quote_table_name(table_name)
    primary_key = connection.primary_key(table_name)
    order_clause = if primary_key.present?
      " ORDER BY #{connection.quote_column_name(primary_key)} DESC"
    else
      ""
    end

    sql = "SELECT * FROM #{quoted_table}#{order_clause} LIMIT #{limit.to_i}"
    connection.exec_query(sql).to_a
  rescue StandardError
    []
  end
end
