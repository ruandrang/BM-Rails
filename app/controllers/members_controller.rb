require "csv"

class MembersController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_admin, except: [ :index ]
  before_action :set_member, only: [ :edit, :update, :destroy ]

  def index
    @members = @club.members.order(:sort_order, :id)
    # 승률 계산 (뷰에서 정렬용)
    raw_stats = cached_member_stats
    @member_stats = raw_stats.index_by { |s| s[:member].id }
  end

  def new
    @member = @club.members.new
  end

  def create
    @member = @club.members.new(member_params)
    @member.sort_order = next_sort_order

    if @member.save
      redirect_to club_members_path(@club), notice: "멤버가 추가되었습니다."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @member.update(member_params)
      redirect_to club_members_path(@club), notice: "멤버가 수정되었습니다."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @member.destroy
    redirect_to club_members_path(@club), notice: "멤버가 삭제되었습니다."
  end

  def import_csv
    file = params[:file]
    if file.blank?
      redirect_to club_members_path(@club), alert: "CSV 파일을 선택해주세요."
      return
    end

    raw = file.read
    csv_text = raw.force_encoding("UTF-8")
    csv_text = csv_text.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
    csv_text = csv_text.sub(/\A\xEF\xBB\xBF/, "")
    imported = 0
    order = next_sort_order

    ActiveRecord::Base.transaction do
      CSV.parse(csv_text, headers: true) do |row|
        attrs = csv_row_to_attributes(row)
        next if attrs[:name].blank?

        @club.members.create!(attrs.merge(sort_order: order))
        order += 1
        imported += 1
      end
    end

    redirect_to club_members_path(@club), notice: "#{imported}명의 멤버를 가져왔습니다."
  rescue StandardError => e
    redirect_to club_members_path(@club), alert: "CSV 가져오기 실패: #{e.message}"
  end

  def export_csv
    headers = %w[이름 나이 키 포지션 등번호]
    csv_data = CSV.generate do |csv|
      csv << headers
      @club.members.order(:sort_order, :id).each do |member|
        csv << [
          member.name,
          member.age,
          member.height_cm,
          member.position,
          member.jersey_number
        ]
      end
    end

    filename = "members-#{@club.id}-#{Time.zone.now.strftime('%Y%m%d')}.csv"
    send_data "\uFEFF#{csv_data}", filename: filename, type: "text/csv; charset=utf-8"
  end

  def reorder
    member_ids = Array(params[:member_ids]).map(&:to_i)
    members = @club.members.where(id: member_ids)
    if members.size != member_ids.size
      render json: { error: "invalid members" }, status: :unprocessable_entity
      return
    end

    ActiveRecord::Base.transaction do
      member_ids.each_with_index do |id, index|
        @club.members.where(id: id).update_all(sort_order: index)
      end
    end

    head :ok
  end

  private

  def set_member
    @member = @club.members.find(params[:id])
  end

  def member_params
    params.require(:member).permit(:name, :age, :height_cm, :position, :jersey_number)
  end

  def next_sort_order
    @club.members.maximum(:sort_order).to_i + 1
  end

  def csv_row_to_attributes(row)
    name = row["이름"] || row["name"] || row["Name"]
    age = row["나이"] || row["age"] || row["Age"]
    height = row["키"] || row["height"] || row["Height"]
    position = row["포지션"] || row["position"] || row["Position"]
    jersey = row["등번호"] || row["jersey_number"] || row["Number"] || row["번호"]

    {
      name: name&.to_s&.strip,
      age: age.presence && age.to_i,
      height_cm: height.presence && height.to_i,
      position: normalize_position(position),
      jersey_number: jersey.presence && jersey.to_i
    }
  end

  def normalize_position(value)
    return "PG" if value.blank?

    normalized = value.to_s.strip.downcase
    return "PG" if %w[pg 포인트가드 포인트 가드 point guard].include?(normalized)
    return "SG" if %w[sg 슈팅가드 슈팅 가드 shooting guard].include?(normalized)
    return "SF" if %w[sf 스몰포워드 스몰 포워드 small forward].include?(normalized)
    return "PF" if %w[pf 파워포워드 파워 포워드 power forward].include?(normalized)
    return "C" if %w[c 센터 center].include?(normalized)
    # Legacy support
    return "PG" if %w[g guard 가드].include?(normalized)
    return "SF" if %w[f forward 포워드].include?(normalized)
    "PG"
  end
end
