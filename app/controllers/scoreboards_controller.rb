class ScoreboardsController < ApplicationController
  before_action :set_club_and_match, only: [ :control, :display ]

  def index
    @clubs = current_user.clubs.includes(:matches).order(created_at: :desc)
  end

  def control
    @teams = @match.teams.order(:label)
  end

  def display
    @teams = @match.teams.order(:label)
    render layout: "scoreboard_display"
  end

  private

  def set_club_and_match
    @club = current_user.clubs.find(params[:club_id])
    @match = @club.matches.find(params[:id])
  end
end
