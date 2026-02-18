# 경기 내 멤버 관리 액션 (이동, 추가, 삭제)
module MatchMembership
  extend ActiveSupport::Concern

  def move_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    if team_member
      team_member.update!(team_id: target_team.id)
      render json: { success: true }
    else
      render json: { success: false, error: "Member not found in this match" }, status: :unprocessable_entity
    end
  rescue StandardError
    render json: { success: false, error: "멤버 이동에 실패했습니다." }, status: :unprocessable_entity
  end

  def add_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    existing_team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first
    if existing_team_member
      return respond_member_update_error("이미 이 경기의 다른 팀에 배정된 멤버입니다.")
    end

    target_team.team_members.create!(member: member)
    respond_member_update_success("멤버가 팀에 추가되었습니다.")
  rescue ActiveRecord::RecordInvalid => e
    respond_member_update_error(e.record.errors.full_messages.first || "멤버 추가에 실패했습니다.")
  rescue StandardError => e
    Rails.logger.error("멤버 추가 실패: #{e.class} - #{e.message}")
    respond_member_update_error("멤버 추가에 실패했습니다.")
  end

  def remove_member
    member = @club.members.find(params[:member_id])
    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    unless team_member
      return render json: { success: false, error: "이 경기에서 멤버를 찾을 수 없습니다." }, status: :unprocessable_entity
    end

    team_member.destroy!
    render json: { success: true }
  rescue StandardError => e
    Rails.logger.error("멤버 삭제 실패: #{e.class} - #{e.message}")
    render json: { success: false, error: "멤버 삭제에 실패했습니다." }, status: :unprocessable_entity
  end

  private

  def respond_member_update_success(message)
    respond_to do |format|
      format.html { redirect_to club_match_path(@club, @match), notice: message }
      format.json { render json: { success: true, message: message } }
    end
  end

  def respond_member_update_error(message)
    respond_to do |format|
      format.html { redirect_to club_match_path(@club, @match), alert: message }
      format.json { render json: { success: false, error: message }, status: :unprocessable_entity }
    end
  end
end
