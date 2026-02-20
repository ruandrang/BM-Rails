class ClubsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club, only: [ :show, :edit, :update, :destroy ]
  before_action :require_club_admin, only: [ :edit, :update ]
  before_action :require_club_owner, only: [ :destroy ]

  def index
    @clubs = current_user.clubs.includes(:members, :matches, :club_memberships).order(created_at: :desc)
    club_ids = @clubs.map(&:id)
    @total_members = Member.where(club_id: club_ids).count
    @monthly_matches = Match.where(club_id: club_ids)
                            .where("played_on >= ?", Date.current.beginning_of_month)
                            .count
  end

  def show
    @members_count = @club.members.count
    @matches_count = @club.matches.count
    @recent_matches = @club.matches.order(played_on: :desc).limit(5)

    # 승률 상위 12명 계산
    member_stats = cached_member_stats

    # 승률 내림차순, 경기 수 내림차순 정렬
    sorted_stats = member_stats.sort_by { |s| [ -s[:win_rate], -s[:games] ] }
    @preview_members = sorted_stats.take(12).map { |s| s[:member] }
  end

  def new
    @club = Club.new(icon: Club::ICONS.first)
  end

  def create
    @club = Club.new(club_params)
    @club.user = current_user
    if @club.save
      @club.club_memberships.create!(
        user: current_user, role: "owner", joined_at: Time.current
      )
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

  def backup
    # View rendering only (Global backup)
  end

  def export_all
    payload = UserExporter.new(current_user).call
    filename = "basketball-manager-backup-#{Time.zone.now.strftime('%Y%m%d')}.json"
    send_data JSON.pretty_generate(payload), filename: filename, type: "application/json"
  end

  MAX_IMPORT_SIZE = 10.megabytes

  def import_all
    file = params[:file]
    if file.blank?
      redirect_to backup_clubs_path, alert: "JSON 파일을 선택해주세요."
      return
    end

    if file.size > MAX_IMPORT_SIZE
      redirect_to backup_clubs_path, alert: "파일 크기가 너무 큽니다. (최대 10MB)"
      return
    end

    payload = JSON.parse(file.read)
    stats = UserImporter.new(current_user, payload).call
    redirect_to clubs_path, notice: import_result_message(stats)
  rescue JSON::ParserError
    redirect_to backup_clubs_path, alert: "JSON 파일 형식이 올바르지 않습니다."
  rescue ArgumentError => e
    redirect_to backup_clubs_path, alert: e.message
  rescue StandardError => e
    Rails.logger.error("데이터 복원 실패: #{e.class} - #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
    redirect_to backup_clubs_path, alert: "복원 중 오류가 발생했습니다. 파일을 확인해주세요."
  end

  private

  def club_params
    params.require(:club).permit(:name, :icon, :description, meeting_days: [])
  end

  def import_result_message(stats)
    parts = []

    if stats[:clubs_added] > 0
      parts << "새 클럽 #{stats[:clubs_added]}개"
    end
    if stats[:members_added] > 0
      parts << "새 멤버 #{stats[:members_added]}명"
    end
    if stats[:matches_added] > 0
      parts << "새 경기 #{stats[:matches_added]}개"
    end

    skipped_parts = []
    if stats[:members_skipped] > 0
      skipped_parts << "멤버 #{stats[:members_skipped]}명"
    end
    if stats[:matches_skipped] > 0
      skipped_parts << "경기 #{stats[:matches_skipped]}개"
    end

    if parts.any?
      message = "#{parts.join(', ')} 추가 완료."
      message += " (이미 존재: #{skipped_parts.join(', ')})" if skipped_parts.any?
      message
    elsif skipped_parts.any?
      "모든 데이터가 이미 존재합니다. (#{skipped_parts.join(', ')} 건너뜀)"
    else
      "복원할 데이터가 없습니다."
    end
  end
end
