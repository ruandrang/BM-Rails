class ClubsController < ApplicationController
  before_action :set_club, only: [ :show, :edit, :update, :destroy, :export_json, :import_json ]

  def index
    @clubs = current_user.clubs.includes(:members, :matches).order(created_at: :desc)
    @total_members = @clubs.sum { |c| c.members.size }
    @monthly_matches = Match.where(club_id: @clubs.pluck(:id))
                            .where("created_at >= ?", Time.current.beginning_of_month)
                            .count
  end

  def show
    @members_count = @club.members.count
    @matches_count = @club.matches.count
    @recent_matches = @club.matches.order(played_on: :desc).limit(5)
    @preview_members = @club.members.order(:sort_order, :id).limit(8)
  end

  def new
    @club = current_user.clubs.new(icon: Club::ICONS.first)
  end

  def create
    @club = current_user.clubs.new(club_params)
    if @club.save
      redirect_to @club, notice: "클럽이 생성되었습니다."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @club.update(club_params)
      redirect_to @club, notice: "클럽 정보가 수정되었습니다."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @club.destroy
    redirect_to clubs_path, notice: "클럽이 삭제되었습니다."
  end

  def export_json
    payload = ClubExporter.new(@club).call
    filename = "club-#{@club.id}-#{Time.zone.now.strftime('%Y%m%d')}.json"
    send_data JSON.pretty_generate(payload), filename: filename, type: "application/json"
  end

  MAX_IMPORT_SIZE = 5.megabytes

  def import_json
    file = params[:file]
    if file.blank?
      redirect_to @club, alert: "JSON 파일을 선택해주세요."
      return
    end

    if file.size > MAX_IMPORT_SIZE
      redirect_to @club, alert: "파일 크기가 너무 큽니다. (최대 5MB)"
      return
    end

    payload = JSON.parse(file.read)
    ClubImporter.new(@club, payload).call
    redirect_to @club, notice: "JSON 데이터를 복원했습니다."
  rescue JSON::ParserError
    redirect_to @club, alert: "JSON 파일 형식이 올바르지 않습니다."
  rescue StandardError => e
    redirect_to @club, alert: "복원 중 오류가 발생했습니다: #{e.message}"
  end

  private

  def set_club
    @club = current_user.clubs.find(params[:id])
  end

  def club_params
    params.require(:club).permit(:name, :icon)
  end
end
