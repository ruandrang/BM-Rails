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
      render json: { success: false, error: t("match_membership.errors.member_not_in_match") }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Move member failed (not found): #{e.class} - #{e.message}")
    render json: { success: false, error: t("match_membership.errors.member_or_team_not_found") }, status: :not_found
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("Move member failed: #{e.class} - #{e.message}")
    render json: { success: false, error: t("match_membership.errors.move_failed") }, status: :unprocessable_entity
  end

  def add_member
    target_team = @match.teams.find(params[:target_team_id])
    member = @club.members.find(params[:member_id])

    existing_team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first
    if existing_team_member
      return respond_member_update_error(t("match_membership.errors.already_assigned"))
    end

    target_team.team_members.create!(member: member)
    respond_member_update_success(t("match_membership.notices.member_added"))
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Add member failed (not found): #{e.class} - #{e.message}")
    respond_member_update_error(t("match_membership.errors.member_or_team_not_found"))
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("Add member failed: #{e.class} - #{e.message}")
    respond_member_update_error(e.record.errors.full_messages.first || t("match_membership.errors.add_failed"))
  end

  def remove_member
    member = @club.members.find(params[:member_id])
    team_member = TeamMember.joins(:team).where(teams: { match_id: @match.id }, member_id: member.id).first

    unless team_member
      return render json: { success: false, error: t("match_membership.errors.member_not_in_match") }, status: :unprocessable_entity
    end

    team_member.destroy!
    render json: { success: true }
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Remove member failed (not found): #{e.class} - #{e.message}")
    render json: { success: false, error: t("match_membership.errors.member_not_found") }, status: :not_found
  rescue ActiveRecord::RecordNotDestroyed => e
    Rails.logger.error("Remove member failed: #{e.class} - #{e.message}")
    render json: { success: false, error: t("match_membership.errors.remove_failed") }, status: :unprocessable_entity
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
