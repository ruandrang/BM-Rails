class ScoreboardsController < ApplicationController
  before_action :set_club
  before_action :set_club_and_match, only: [ :control, :display ]

  def index
    @clubs = current_user.clubs.includes(:matches).order(created_at: :desc)
  end

  def standalone_control
    @match = Struct.new(:id, :home_team, :away_team, :teams, :date).new(
      "standalone_u#{current_user.id}",
      Struct.new(:id, :name, :icon, :color, :label).new(1, "HOME", "🏀", "#1e40af", "HOME"),
      Struct.new(:id, :name, :icon, :color, :label).new(2, "AWAY", "🏀", "#dc2626", "AWAY"),
      [],
      Date.today
    )
    @match.teams = [ @match.home_team, @match.away_team ]
    render :control
  end

  def standalone_display
    @match = Struct.new(:id, :home_team, :away_team, :teams, :date).new(
      "standalone_u#{current_user.id}",
      Struct.new(:id, :name, :icon, :color, :label).new(1, "HOME", "🏀", "#1e40af", "HOME"),
      Struct.new(:id, :name, :icon, :color, :label).new(2, "AWAY", "🏀", "#dc2626", "AWAY"),
      [],
      Date.today
    )
    @match.teams = [ @match.home_team, @match.away_team ]
    @teams = @match.teams
    render :display, layout: "scoreboard_display"
  end

  def control
    @teams = @match.teams.order(:label).includes(:members)
  end

  def display
    @teams = @match.teams.order(:label)
    render layout: "scoreboard_display"
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:club_id]) if params[:club_id]
  end

  def set_club_and_match
    @club = current_user.clubs.find(params[:club_id])
    @match = @club.matches.find(params[:id])
  end
end
