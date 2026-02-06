class UserExporter
  def initialize(user)
    @user = user
  end

  def call
    {
      version: 1,
      clubs: @user.clubs.order(:created_at).map { |club| ClubExporter.new(club).call }
    }
  end
end
